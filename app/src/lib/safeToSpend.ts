/*
Safe to Spend - the only number on the dashboard that supports a decision.

"You spent ₹18,400 this month" is a rear-view mirror; it cannot be changed.
"₹410 is safe to spend today" can be acted on before lunch.

    income
  - commitments due this month      (EMIs, rent, subscriptions)
  - planned goal contributions      (savings, trip fund)
  - discretionary spend, month to date
  = safe to spend
  / days remaining                  = today's allowance

Pure functions only - no Firestore imports - so this is unit-testable and
cannot accidentally depend on where the data came from.
*/

import type { Track, Transaction } from './types'

export interface SafeToSpendResult {
  incomeMinor: number
  committedMinor: number
  plannedSavingsMinor: number
  spentMinor: number
  safeToSpendMinor: number
  daysRemaining: number
  todayAllowanceMinor: number
}

export function daysInMonth(ref: Date): number {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
}

/** Days left including today, so the last day of the month is 1 and never 0. */
export function daysRemainingInMonth(ref: Date): number {
  return Math.max(1, daysInMonth(ref) - ref.getDate() + 1)
}

/** Is an ISO 'YYYY-MM-DD' date inside the same calendar month as `ref`? */
export function isInMonth(occurredOn: string, ref: Date): boolean {
  const [year, month] = occurredOn.split('-').map(Number)
  return year === ref.getFullYear() && month === ref.getMonth() + 1
}

function activeTracks(tracks: Track[]): Track[] {
  return tracks.filter((t) => !t.archived)
}

/** Commitments are reserved for the whole month regardless of whether they've been paid yet. */
export function committedThisMonthMinor(tracks: Track[]): number {
  return activeTracks(tracks)
    .filter((t) => t.type === 'commitment')
    .reduce((sum, t) => sum + (t.commitmentAmountMinor ?? 0), 0)
}

export function plannedSavingsThisMonthMinor(tracks: Track[]): number {
  return activeTracks(tracks)
    .filter((t) => t.type === 'goal' || t.type === 'project')
    .reduce((sum, t) => sum + (t.plannedMonthlyMinor ?? 0), 0)
}

/**
 * Discretionary spend for the month.
 *
 * Two exclusions that matter, and both are easy to get wrong:
 *
 * - `income` and `transfer` are never spend. A ₹10,000 savings contribution is
 *   a transfer; counting it as an expense would make money you still hold look gone.
 *
 * - Expenses charged to a COMMITMENT track are excluded, because that money was
 *   already subtracted up front by committedThisMonthMinor(). Counting the EMI
 *   payment as well would deduct the same rupees twice.
 */
export function spentThisMonthMinor(
  transactions: Transaction[],
  tracks: Track[],
  ref: Date,
): number {
  const commitmentTrackIds = new Set(
    tracks.filter((t) => t.type === 'commitment').map((t) => t.id),
  )

  let total = 0

  for (const txn of transactions) {
    if (txn.deletedAt) continue
    if (!isInMonth(txn.occurredOn, ref)) continue
    if (commitmentTrackIds.has(txn.trackId)) continue

    if (txn.movement === 'expense') {
      total += txn.amountMinor
    } else if (txn.movement === 'refund') {
      total -= txn.amountMinor
    }
  }

  return total
}

export function computeSafeToSpend(args: {
  monthlyIncomeMinor: number
  tracks: Track[]
  transactions: Transaction[]
  today: Date
}): SafeToSpendResult {
  const { monthlyIncomeMinor, tracks, transactions, today } = args

  const committedMinor = committedThisMonthMinor(tracks)
  const plannedSavingsMinor = plannedSavingsThisMonthMinor(tracks)
  const spentMinor = spentThisMonthMinor(transactions, tracks, today)

  const safeToSpendMinor =
    monthlyIncomeMinor - committedMinor - plannedSavingsMinor - spentMinor

  const daysRemaining = daysRemainingInMonth(today)

  // Never suggest a negative daily allowance - an overspent month shows ₹0 to
  // spend today, not a number that implies you can un-spend money.
  const todayAllowanceMinor = Math.floor(Math.max(0, safeToSpendMinor) / daysRemaining)

  return {
    incomeMinor: monthlyIncomeMinor,
    committedMinor,
    plannedSavingsMinor,
    spentMinor,
    safeToSpendMinor,
    daysRemaining,
    todayAllowanceMinor,
  }
}
