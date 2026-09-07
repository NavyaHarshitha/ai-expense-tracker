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

export type SafeToSpendBasis = 'balance' | 'income'

export interface SafeToSpendResult {
  /**
   * Which starting figure this was built from.
   *
   * 'balance' is the real one: what your accounts actually hold. 'income' is the
   * fallback for someone who has not added an account yet.
   */
  basis: SafeToSpendBasis
  /** Cash across accounts, and what is owed on cards. Zero on the income basis. */
  cashMinor: number
  owedMinor: number
  /** Commitments this month that have NOT been paid yet. */
  committedRemainingMinor: number
  /** Planned savings this month not yet transferred. */
  savingsRemainingMinor: number
  /** Held for commitments that fall due before the next salary. */
  preSalaryHeldMinor: number
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

/**
 * Commitments still to leave this month.
 *
 * On the balance basis this replaces the full committed figure, and the
 * distinction is the whole point: once rent has gone out, the account balance
 * has already dropped by it. Subtracting the full commitment as well would
 * deduct the same rent twice - which is exactly the double-count the old
 * income-based version had to avoid in the opposite direction.
 */
export function commitmentsRemainingThisMonthMinor(
  tracks: Track[],
  transactions: Transaction[],
  ref: Date,
  /** Day the salary lands. Enables pre-payday reserving; omit to disable. */
  paydayDay?: number,
): number {
  let remaining = 0

  for (const track of activeTracks(tracks)) {
    if (track.type !== 'commitment') continue

    const due = track.commitmentAmountMinor ?? 0
    if (due <= 0) continue

    /*
    A commitment due BEFORE payday is always funded a cycle early.

    Rent on the 1st with a salary on the 5th cannot be paid by that month's
    salary - it comes out of the previous month's money. So there is always
    exactly ONE upcoming instance to hold back, whether or not this month's has
    gone out: before the 1st it is this month's, after the 1st it is next
    month's. Never zero, because the next one is always looming; never two,
    because only one is ever next.

    Without this the money frees up the moment rent clears and gets spent, and
    the 1st arrives short - which is exactly what a second "next month rent"
    track was compensating for by hand.
    */
    if (paydayDay !== undefined && track.dueDay !== undefined && track.dueDay < paydayDay) {
      remaining += due
      continue
    }

    const paid = transactions
      .filter(
        (t) =>
          !t.deletedAt &&
          t.trackId === track.id &&
          isInMonth(t.occurredOn, ref) &&
          (t.movement === 'expense' || t.movement === 'transfer'),
      )
      .reduce((sum, t) => sum + t.amountMinor, 0)

    // Never negative: overpaying a commitment does not create spendable money.
    remaining += Math.max(0, due - paid)
  }

  return remaining
}

/** Planned savings not yet moved this month, by the same reasoning. */
export function savingsRemainingThisMonthMinor(
  tracks: Track[],
  transactions: Transaction[],
  ref: Date,
): number {
  let remaining = 0

  for (const track of activeTracks(tracks)) {
    if (track.type !== 'goal' && track.type !== 'project') continue

    const planned = track.plannedMonthlyMinor ?? 0
    if (planned <= 0) continue

    const moved = transactions
      .filter(
        (t) =>
          !t.deletedAt &&
          isInMonth(t.occurredOn, ref) &&
          t.movement === 'transfer' &&
          (t.toTrackId === track.id || t.trackId === track.id),
      )
      .reduce((sum, t) => sum + t.amountMinor, 0)

    remaining += Math.max(0, planned - moved)
  }

  return remaining
}

export function computeSafeToSpend(args: {
  monthlyIncomeMinor: number
  tracks: Track[]
  transactions: Transaction[]
  today: Date
  /** Day the salary lands, so pre-payday commitments are held a cycle early. */
  paydayDay?: number
  /**
   * Cash across accounts. When given, this is the basis instead of income -
   * real money rather than an assumption that the salary arrived and the month
   * started from zero.
   */
  cashMinor?: number
  /** Owed on credit cards, subtracted as the liability it is. */
  owedMinor?: number
}): SafeToSpendResult {
  const { monthlyIncomeMinor, tracks, transactions, today, paydayDay, cashMinor, owedMinor } =
    args

  const committedMinor = committedThisMonthMinor(tracks)
  const plannedSavingsMinor = plannedSavingsThisMonthMinor(tracks)
  const spentMinor = spentThisMonthMinor(transactions, tracks, today)
  const spentTodayMinor = spentOnDayMinor(transactions, tracks, today)

  const committedRemainingMinor = commitmentsRemainingThisMonthMinor(
    tracks,
    transactions,
    today,
    paydayDay,
  )
  const savingsRemainingMinor = savingsRemainingThisMonthMinor(tracks, transactions, today)

  /*
  Balance basis, when accounts exist.

  What you can spend is what you HOLD, less what is still promised out of it -
  not a typed salary less everything. The balance already reflects your spending
  (it went down), already includes whatever last month left over, and already
  knows whether the salary has actually landed. So spentThisMonth is deliberately
  NOT subtracted here: doing so would deduct the same rupees twice.

  Card debt subtracts as the liability it is. That is conservative when the bill
  is not due until next month, and being slightly pessimistic about money you
  genuinely owe is the right direction for a figure people spend against.
  */
  const usingBalance = cashMinor !== undefined
  const basis: SafeToSpendBasis = usingBalance ? 'balance' : 'income'
  const cash = cashMinor ?? 0
  const owed = owedMinor ?? 0

  const safeToSpendMinor = usingBalance
    ? cash - owed - committedRemainingMinor - savingsRemainingMinor
    : monthlyIncomeMinor - committedMinor - plannedSavingsMinor - spentMinor

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
  const poolAtStartOfTodayMinor = usingBalance
    ? // Add today's spending back to recover the balance as it stood this morning.
      cash + spentTodayMinor - owed - committedRemainingMinor - savingsRemainingMinor
    : monthlyIncomeMinor - committedMinor - plannedSavingsMinor - (spentMinor - spentTodayMinor)

  const todayAllowanceMinor = Math.floor(
    Math.max(0, poolAtStartOfTodayMinor) / daysRemaining,
  )

  // Never negative: an exhausted day shows nothing left, not a figure implying
  // money can be un-spent.
  const leftTodayMinor = Math.max(0, todayAllowanceMinor - spentTodayMinor)

  /* Reported separately so the held money is visible rather than just missing. */
  const preSalaryHeldMinor =
    paydayDay === undefined
      ? 0
      : activeTracks(tracks)
          .filter(
            (t) =>
              t.type === 'commitment' && t.dueDay !== undefined && t.dueDay < paydayDay,
          )
          .reduce((sum, t) => sum + (t.commitmentAmountMinor ?? 0), 0)

  return {
    basis,
    preSalaryHeldMinor,
    cashMinor: cash,
    owedMinor: owed,
    committedRemainingMinor,
    savingsRemainingMinor,
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
