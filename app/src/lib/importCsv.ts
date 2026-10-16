/*
Reading a spreadsheet export into ledger rows.

The format is deliberately small, so anyone can produce it from their own sheet:

  date,description,amount,category,type,track
  2026-07-01,swiggy,311,Food,expense,Daily Expenses

  - date         YYYY-MM-DD
  - amount       rupees, always positive; the type carries the direction
  - type         expense | income | refund | savings
  - track        optional; defaults to Daily Expenses, or Savings for savings

Everything here is pure, and nothing is written until the user has seen what
will be: an import is hundreds of rows landing at once, so a wrong column
would otherwise be hundreds of wrong rows. Every row is checked the same way a
typed one would be - a real date, a positive amount inside MAX_AMOUNT_MINOR -
and a row that fails is reported by line rather than guessed at.
*/

import { checkDuplicate } from './categories'
import { MAX_AMOUNT_MINOR, toAmountMinor } from './money'
import type { Category, Movement, Track, TrackType } from './types'

export type ImportType = 'expense' | 'income' | 'refund' | 'savings'

export interface ImportRow {
  /** 1-based line in the file, so a problem can be found in the sheet. */
  line: number
  occurredOn: string
  description: string
  amountMinor: number
  categoryName: string
  type: ImportType
  trackName: string
}

export interface ImportProblem {
  line: number
  message: string
}

export const IMPORT_COLUMNS = ['date', 'description', 'amount', 'category', 'type', 'track'] as const

const TYPES: ImportType[] = ['expense', 'income', 'refund', 'savings']

export const DEFAULT_TRACK = 'Daily Expenses'
export const DEFAULT_SAVINGS_TRACK = 'Savings'

/** Enough for years of daily entries; beyond it, the file is probably not what was meant. */
export const MAX_IMPORT_ROWS = 5_000

/**
 * A savings row is money moved into a goal, not money spent - the same rule
 * the rest of the app uses, so a contribution never looks like a loss.
 */
export function movementFor(type: ImportType): Movement {
  return type === 'savings' ? 'transfer' : type
}

/**
 * Split CSV text into rows of cells.
 *
 * Handles what spreadsheet exports actually produce: quoted cells containing
 * commas or newlines, doubled quotes inside them, CRLF line endings, and the
 * byte-order mark Excel puts at the start.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Collapse whitespace and cap length, as every other text field in the app is. */
function clean(value: string | undefined, limit = 120): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

/**
 * Read an import file into rows, with every rejected line explained.
 *
 * `today` is YYYY-MM-DD: a future-dated row is refused, because the ledger
 * records money that has moved, and a typo in the year would otherwise file an
 * expense in a month nobody is looking at.
 */
export function readImport(text: string, today: string): { rows: ImportRow[]; problems: ImportProblem[] } {
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (table.length === 0) return { rows: [], problems: [{ line: 1, message: 'The file is empty.' }] }

  const header = table[0].map((h) => h.trim().toLowerCase())
  const col = Object.fromEntries(IMPORT_COLUMNS.map((name) => [name, header.indexOf(name)]))

  const missing = IMPORT_COLUMNS.filter((name) => name !== 'track' && col[name] === -1)
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [{ line: 1, message: `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.` }],
    }
  }

  const body = table.slice(1)
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      problems: [{ line: 1, message: `That is ${body.length} rows - split it into files of ${MAX_IMPORT_ROWS} or fewer.` }],
    }
  }

  const rows: ImportRow[] = []
  const problems: ImportProblem[] = []

  body.forEach((cells, i) => {
    const line = i + 2
    const get = (name: (typeof IMPORT_COLUMNS)[number]) => (col[name] >= 0 ? cells[col[name]] : undefined)

    const occurredOn = clean(get('date'))
    if (!isRealDate(occurredOn)) {
      problems.push({ line, message: `"${occurredOn}" is not a date in YYYY-MM-DD form.` })
      return
    }
    if (occurredOn > today) {
      problems.push({ line, message: `${occurredOn} is in the future.` })
      return
    }

    const rawAmount = clean(get('amount'))
    // A sign is a direction, and direction belongs to the type. Flipping "-50"
    // into a 50 expense would be guessing what the sheet meant.
    if (rawAmount.startsWith('-')) {
      problems.push({ line, message: `${rawAmount} is negative - use a positive amount with type "refund" or "income".` })
      return
    }
    const amountMinor = toAmountMinor(rawAmount)
    if (!rawAmount || amountMinor <= 0) {
      problems.push({ line, message: `"${rawAmount}" is not an amount above zero.` })
      return
    }
    if (amountMinor >= MAX_AMOUNT_MINOR) {
      problems.push({ line, message: `${rawAmount} is larger than the app accepts.` })
      return
    }

    const type = clean(get('type')).toLowerCase() as ImportType
    if (!TYPES.includes(type)) {
      problems.push({ line, message: `Type "${get('type') ?? ''}" must be one of: ${TYPES.join(', ')}.` })
      return
    }

    const categoryName = clean(get('category'), 60) || 'Other'
    rows.push({
      line,
      occurredOn,
      description: clean(get('description')) || categoryName,
      amountMinor,
      categoryName,
      type,
      trackName:
        clean(get('track'), 60) || (type === 'savings' ? DEFAULT_SAVINGS_TRACK : DEFAULT_TRACK),
    })
  })

  return { rows, problems }
}

export interface ImportPlan {
  /** Tracks that do not exist yet, by name, with the type they will be created as. */
  newTracks: Array<{ name: string; type: TrackType }>
  /** Categories that do not exist yet, spelled as the file first spells them. */
  newCategories: string[]
}

/**
 * What an import will have to create before its rows can be written.
 *
 * Names are matched case-insensitively against live tracks, so "daily expenses"
 * lands in an existing "Daily Expenses" rather than beside it. A track that
 * receives savings is created as a goal - that is what makes the contributions
 * count toward it - and any other as a spending track. Categories go through
 * the same duplicate check as everywhere else, so an import cannot add a twin.
 */
export function planImport(rows: ImportRow[], tracks: Track[], categories: Category[]): ImportPlan {
  const live = tracks.filter((t) => !t.archived)
  const newTracks = new Map<string, { name: string; type: TrackType }>()

  for (const row of rows) {
    const key = row.trackName.toLowerCase()
    if (live.some((t) => t.name.toLowerCase() === key)) continue
    const existing = newTracks.get(key)
    if (!existing) newTracks.set(key, { name: row.trackName, type: row.type === 'savings' ? 'goal' : 'spending' })
    else if (row.type === 'savings') existing.type = 'goal'
  }

  const newCategories: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const key = row.categoryName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!checkDuplicate(row.categoryName, categories).exact) newCategories.push(row.categoryName)
  }

  return { newTracks: [...newTracks.values()], newCategories }
}

export interface ImportSummary {
  count: number
  from: string
  to: string
  totalsMinor: Record<ImportType, number>
}

export function summariseImport(rows: ImportRow[]): ImportSummary {
  const totalsMinor: Record<ImportType, number> = { expense: 0, income: 0, refund: 0, savings: 0 }
  for (const row of rows) totalsMinor[row.type] += row.amountMinor
  const dates = rows.map((r) => r.occurredOn).sort()
  return { count: rows.length, from: dates[0] ?? '', to: dates[dates.length - 1] ?? '', totalsMinor }
}
