/*
Bank balance, derived rather than stored.

  balance = anchor + everything in - everything out, since the anchor date

The anchor is a figure you assert ("my balance today is Rs 84,000") together
with the date it was true. Everything after it is computed from the ledger, so
the number is only as accurate as your logging - which is why the card says so
and offers to re-anchor rather than pretending to be the bank.

One deliberate simplification: a cash expense is counted the moment it is spent,
not when it was withdrawn. Modelling that properly needs an ATM-withdrawal
concept; counting cash when spent is the closer approximation, because the
alternative is cash spending never reducing the balance at all.
*/

import type { Track, Transaction } from './types'

export interface BalanceResult {
  /** The asserted figure this is built from. */
  anchorMinor: number
  anchorOn: string | null
  /** Money in since the anchor: income and refunds. */
  inMinor: number
  /** Money out since the anchor: expenses and transfers into savings. */
  outMinor: number
  balanceMinor: number
  /** How many ledger rows contributed - so the UI can say "from 42 entries". */
  countedRows: number
  /** True when no anchor has ever been set, so the figure is not meaningful yet. */
  unset: boolean
}

/** Rows dated on or after the anchor date. On the anchor date itself, they count. */
function sinceAnchor(occurredOn: string, anchorOn: string): boolean {
  // ISO YYYY-MM-DD strings compare correctly as strings.
  return occurredOn >= anchorOn
}

export function computeBalance(args: {
  anchorMinor: number | undefined
  anchorOn: string | undefined
  transactions: Transaction[]
  tracks: Track[]
}): BalanceResult {
  const { anchorMinor, anchorOn, transactions, tracks } = args

  if (anchorMinor === undefined || !anchorOn) {
    return {
      anchorMinor: 0,
      anchorOn: null,
      inMinor: 0,
      outMinor: 0,
      balanceMinor: 0,
      countedRows: 0,
      unset: true,
    }
  }

  // Transfers into a goal or project leave the bank; anything else does not move it.
  const savingsTrackIds = new Set(
    tracks.filter((t) => t.type === 'goal' || t.type === 'project').map((t) => t.id),
  )

  let inMinor = 0
  let outMinor = 0
  let countedRows = 0

  for (const txn of transactions) {
    if (txn.deletedAt) continue
    if (!txn.occurredOn || !sinceAnchor(txn.occurredOn, anchorOn)) continue

    switch (txn.movement) {
      case 'income':
        inMinor += txn.amountMinor
        countedRows++
        break

      case 'refund':
        inMinor += txn.amountMinor
        countedRows++
        break

      case 'expense':
        // Every expense leaves the account, including commitment-track ones -
        // the EMI genuinely debits. This is separate from Safe-to-Spend, which
        // excludes them because they were already reserved.
        outMinor += txn.amountMinor
        countedRows++
        break

      case 'transfer': {
        const destination = txn.toTrackId ?? txn.trackId
        if (savingsTrackIds.has(destination)) {
          outMinor += txn.amountMinor
          countedRows++
        }
        // A transfer between two spending tracks moves nothing in the bank.
        break
      }
    }
  }

  return {
    anchorMinor,
    anchorOn,
    inMinor,
    outMinor,
    balanceMinor: anchorMinor + inMinor - outMinor,
    countedRows,
    unset: false,
  }
}

/**
 * What a track currently holds: money it started with, plus money moved in,
 * less money spent out of it.
 *
 * Used for goals and projects, where "how much is in there" is the question.
 */
export function trackHoldingMinor(track: Track, transactions: Transaction[]): number {
  let total = track.openingBalanceMinor ?? 0

  for (const txn of transactions) {
    if (txn.deletedAt) continue
    if (txn.trackId !== track.id && txn.toTrackId !== track.id) continue

    if (txn.movement === 'transfer' && (txn.toTrackId ?? txn.trackId) === track.id) {
      total += txn.amountMinor
    } else if (txn.trackId === track.id) {
      if (txn.movement === 'expense') total -= txn.amountMinor
      else if (txn.movement === 'refund') total += txn.amountMinor
    }
  }

  return total
}
