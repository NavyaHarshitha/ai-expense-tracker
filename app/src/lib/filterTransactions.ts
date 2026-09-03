/*
Search and filtering over the ledger.

Performance notes, because this is the code path that has to survive a ledger
with tens of thousands of rows:

1. The search haystack is built ONCE per transaction (indexTransactions) and
   reused across keystrokes. Lowercasing four fields per row on every keypress
   is the difference between instant and laggy at scale.

2. Filters are applied in cheapest-first order - exact string equality before
   substring search - so most rows are rejected without touching the haystack.

3. This is deliberately a plain loop rather than chained .filter() calls: one
   pass, no intermediate arrays.

At genuinely large scale the next move is server-side: Firestore composite
indexes on (categoryName, occurredOn) for the dropdown filters, and BigQuery
for free-text. Client-side is the right answer up to the tens of thousands.
*/

import type { Movement, Transaction } from './types'

export interface TransactionFilters {
  /** '' means all categories */
  category: string
  /** '' means all tracks */
  track: string
  /** '' means all movement types */
  movement: Movement | ''
  /** free text over description, note, category and payment method */
  query: string
}

export const EMPTY_FILTERS: TransactionFilters = {
  category: '',
  track: '',
  movement: '',
  query: '',
}

export interface IndexedTransaction {
  txn: Transaction
  /** lowercased, pre-joined searchable text - built once, reused every keystroke */
  haystack: string
}

export function indexTransactions(rows: Transaction[]): IndexedTransaction[] {
  const indexed: IndexedTransaction[] = new Array(rows.length)

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i]
    indexed[i] = {
      txn: t,
      haystack: `${t.description} ${t.note ?? ''} ${t.categoryName} ${t.paymentMethod}`.toLowerCase(),
    }
  }

  return indexed
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(filters.category || filters.track || filters.movement || filters.query.trim())
}

export function filterIndexed(
  indexed: IndexedTransaction[],
  filters: TransactionFilters,
): Transaction[] {
  const { category, track, movement } = filters
  const query = filters.query.trim().toLowerCase()

  // Nothing selected - hand back the originals without copying field by field.
  if (!category && !track && !movement && !query) {
    return indexed.map((i) => i.txn)
  }

  const out: Transaction[] = []

  for (let i = 0; i < indexed.length; i++) {
    const { txn, haystack } = indexed[i]

    // Cheapest comparisons first, so most rows exit before the substring scan.
    if (category && txn.categoryName !== category) continue
    if (track && txn.trackId !== track) continue
    if (movement && txn.movement !== movement) continue
    if (query && !haystack.includes(query)) continue

    out.push(txn)
  }

  return out
}

export interface CategoryCount {
  name: string
  count: number
  totalMinor: number
}

/**
 * Categories present in the data, with counts, for the filter dropdown.
 *
 * Driven by what's actually in the ledger rather than a hardcoded list, so
 * categories created later (by voice, or by the email parser) appear here
 * without any change to this code.
 */
export function categoryCounts(rows: Transaction[]): CategoryCount[] {
  const map = new Map<string, CategoryCount>()

  for (const t of rows) {
    const existing = map.get(t.categoryName)
    const delta =
      t.movement === 'expense' ? t.amountMinor : t.movement === 'refund' ? -t.amountMinor : 0

    if (existing) {
      existing.count += 1
      existing.totalMinor += delta
    } else {
      map.set(t.categoryName, { name: t.categoryName, count: 1, totalMinor: delta })
    }
  }

  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor || a.name.localeCompare(b.name))
}

/** Net spend of a filtered set, so the header can report what's on screen. */
export function netSpendOf(rows: Transaction[]): number {
  let total = 0
  for (const t of rows) {
    if (t.movement === 'expense') total += t.amountMinor
    else if (t.movement === 'refund') total -= t.amountMinor
  }
  return total
}
