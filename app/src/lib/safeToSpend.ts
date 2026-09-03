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
  /** Discretionary spend for the whole month, today included. */
  spentMinor: number
  /** Discretionary spend today only. */
  spentTodayMinor: number
  /** Whole-month figure: income less commitments, savings and month-to-date spend. */
  safeToSpendMinor: number
  daysRemaining: number
  /** Today's even share of what was left at the START of today. */
  todayAllowanceMinor: number
  /** What is still spendable today: the allowance less what today already cost. */
  leftTodayMinor: number
}

export function daysInMonth(ref: Date): number {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
}

/** Days left including today, so the last day of the month is 1 and never 0. */
export function daysRemainingInMonth(ref: Date): number {
  return Math.max(1, daysInMonth(ref) - ref.getDate() + 1)
}

/** Is an ISO 'YYYY-MM-DD' date the same calendar day as `ref`? Local time, not UTC. */
export function isSameDay(occurredOn: string, ref: Date): boolean {
  const [year, month, day] = occurredOn.split('-').map(Number)
  return (
    year === ref.getFullYear() && month === ref.getMonth() + 1 && day === ref.getDate()
  )
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

/**
 * Discretionary spend on a single day.
 *
 * Same exclusions as the monthly figure: transfers and income are never spend,
 * and commitment-track expenses were already reserved up front.
 */
export function spentOnDayMinor(
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
    if (!isSameDay(txn.occurredOn, ref)) continue
    if (commitmentTrackIds.has(txn.trackId)) continue

    if (txn.movement === 'expense') total += txn.amountMinor
    else if (txn.movement === 'refund') total -= txn.amountMinor
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
  const spentTodayMinor = spentOnDayMinor(transactions, tracks, today)

  const safeToSpendMinor =
    monthlyIncomeMinor - committedMinor - plannedSavingsMinor - spentMinor

  const daysRemaining = daysRemainingInMonth(today)

  /*
  Today's allowance is the even share of what was left at the START of today -
  so it is computed from spend BEFORE today, not including today.

  This is what makes leftover roll forward on its own. Spend nothing today and
  the whole pool divides across one fewer day tomorrow, so tomorrow's allowance
  rises. Overspend today and tomorrow's falls. There is no separate rollover
  ledger to keep in sync; it is a consequence of dividing what remains by the
  days that remain.

  Dividing the whole month's remainder instead would mean spending Rs 600 today
  lowered today's own figure by Rs 600/daysRemaining - about Rs 21 - so a card
  labelled "safe to spend today" would barely move as the day was spent.
  */
  const poolAtStartOfTodayMinor =
    monthlyIncomeMinor - committedMinor - plannedSavingsMinor - (spentMinor - spentTodayMinor)

  const todayAllowanceMinor = Math.floor(
    Math.max(0, poolAtStartOfTodayMinor) / daysRemaining,
  )

  // Never negative: an exhausted day shows nothing left, not a figure implying
  // money can be un-spent.
  const leftTodayMinor = Math.max(0, todayAllowanceMinor - spentTodayMinor)

  return {
    incomeMinor: monthlyIncomeMinor,
    committedMinor,
    plannedSavingsMinor,
    spentMinor,
    spentTodayMinor,
    safeToSpendMinor,
    daysRemaining,
    todayAllowanceMinor,
    leftTodayMinor,
  }
}
