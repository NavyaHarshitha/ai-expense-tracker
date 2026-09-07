import { describe, expect, it } from 'vitest'

import {
  computeSafeToSpend,
  daysRemainingInMonth,
  isInMonth,
  isSameDay,
  spentThisMonthMinor,
} from './safeToSpend'
import { toPaise, formatINR } from './money'
import type { Track, Transaction } from './types'

// ₹80,000 income, ₹18,000 EMI, ₹10,000/month to savings.
const tracks: Track[] = [
  { id: 'daily', name: 'Daily Expenses', type: 'spending', archived: false, monthlyLimitMinor: toPaise(20000) },
  { id: 'emi', name: 'Home Loan EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18000), dueDay: 28 },
  { id: 'fund', name: 'Emergency Fund', type: 'goal', archived: false, targetMinor: toPaise(300000), plannedMonthlyMinor: toPaise(10000), raidable: false },
]

const INCOME = toPaise(80000)

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't', occurredOn: '2026-08-10', amountMinor: toPaise(500),
    movement: 'expense', trackId: 'daily', categoryName: 'Food',
    description: 'lunch', paymentMethod: 'upi', source: 'manual',
    createdAt: 0, deletedAt: null,
    ...over,
  }
}

const AUG_15 = new Date(2026, 7, 15) // 15 Aug 2026

describe('date helpers', () => {
  it('counts days remaining including today', () => {
    expect(daysRemainingInMonth(new Date(2026, 7, 15))).toBe(17) // 31 - 15 + 1
  })

  it('returns 1 on the last day of the month, never 0', () => {
    expect(daysRemainingInMonth(new Date(2026, 7, 31))).toBe(1)
    expect(daysRemainingInMonth(new Date(2026, 1, 28))).toBe(1) // Feb 2026, non-leap
  })

  it('matches only dates in the same calendar month', () => {
    expect(isInMonth('2026-08-01', AUG_15)).toBe(true)
    expect(isInMonth('2026-07-31', AUG_15)).toBe(false)
    expect(isInMonth('2025-08-15', AUG_15)).toBe(false)
  })
})

describe('spentThisMonthMinor', () => {
  it('sums expenses in the current month only', () => {
    const spent = spentThisMonthMinor(
      [
        txn({ id: 'a', amountMinor: toPaise(300) }),
        txn({ id: 'b', amountMinor: toPaise(700) }),
        txn({ id: 'old', amountMinor: toPaise(9999), occurredOn: '2026-07-04' }),
      ],
      tracks,
      AUG_15,
    )
    expect(spent).toBe(toPaise(1000))
  })

  it('treats a refund as negative spend', () => {
    const spent = spentThisMonthMinor(
      [
        txn({ id: 'a', amountMinor: toPaise(2000) }),
        txn({ id: 'r', amountMinor: toPaise(500), movement: 'refund' }),
      ],
      tracks,
      AUG_15,
    )
    expect(spent).toBe(toPaise(1500))
  })

  it('never counts income or transfers as spend', () => {
    const spent = spentThisMonthMinor(
      [
        txn({ id: 'sal', amountMinor: toPaise(80000), movement: 'income' }),
        txn({ id: 'sav', amountMinor: toPaise(10000), movement: 'transfer', trackId: 'fund' }),
      ],
      tracks,
      AUG_15,
    )
    expect(spent).toBe(0)
  })

  it('excludes expenses on commitment tracks, which are already reserved', () => {
    // The regression this guards: the EMI is subtracted up front AND paid as a
    // transaction. Counting both deducts ₹18,000 twice.
    const spent = spentThisMonthMinor(
      [txn({ id: 'emipay', amountMinor: toPaise(18000), trackId: 'emi' })],
      tracks,
      AUG_15,
    )
    expect(spent).toBe(0)
  })

  it('ignores soft-deleted transactions', () => {
    const spent = spentThisMonthMinor(
      [txn({ id: 'gone', amountMinor: toPaise(4000), deletedAt: 12345 })],
      tracks,
      AUG_15,
    )
    expect(spent).toBe(0)
  })
})

describe('computeSafeToSpend', () => {
  it('reserves commitments and savings before discretionary spend', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: INCOME,
      tracks,
      transactions: [txn({ amountMinor: toPaise(12000) })],
      today: AUG_15,
    })

    // 80,000 - 18,000 EMI - 10,000 savings - 12,000 spent = 40,000
    expect(r.committedMinor).toBe(toPaise(18000))
    expect(r.plannedSavingsMinor).toBe(toPaise(10000))
    expect(r.spentMinor).toBe(toPaise(12000))
    expect(r.safeToSpendMinor).toBe(toPaise(40000))

    // ₹40,000 over 17 remaining days
    expect(r.daysRemaining).toBe(17)
    expect(r.todayAllowanceMinor).toBe(Math.floor(toPaise(40000) / 17))
  })

  it('handles zero income without producing NaN', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: 0, tracks, transactions: [], today: AUG_15,
    })
    expect(Number.isNaN(r.safeToSpendMinor)).toBe(false)
    expect(r.safeToSpendMinor).toBe(-toPaise(28000))
    expect(r.todayAllowanceMinor).toBe(0) // never negative
  })

  it('shows zero allowance when overspent rather than a negative number', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: INCOME,
      tracks,
      transactions: [txn({ amountMinor: toPaise(90000) })],
      today: AUG_15,
    })
    expect(r.safeToSpendMinor).toBeLessThan(0)
    expect(r.todayAllowanceMinor).toBe(0)
  })

  it('does not divide by zero on the last day of the month', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: INCOME, tracks, transactions: [], today: new Date(2026, 7, 31),
    })
    expect(r.daysRemaining).toBe(1)
    expect(r.todayAllowanceMinor).toBe(toPaise(52000))
  })
})

describe('money', () => {
  it('stores rupees as integer paise', () => {
    expect(toPaise('250')).toBe(25000)
    expect(toPaise('250.50')).toBe(25050)
    expect(toPaise(' ₹1,200 ')).toBe(120000)
  })

  it('rounds rather than truncating', () => {
    expect(toPaise('0.555')).toBe(56)
  })

  it('returns 0 for unparseable input instead of NaN', () => {
    expect(toPaise('abc')).toBe(0)
    expect(toPaise('')).toBe(0)
  })

  it('formats with Indian lakh grouping', () => {
    // ₹1,00,000 - not ₹100,000
    expect(formatINR(toPaise(100000))).toContain('1,00,000')
  })
})


// ---------------------------------------------------------------------------
// Daily allowance and rollover
// ---------------------------------------------------------------------------

describe("today's allowance and rollover", () => {
  // Navya's real shape: Rs 1,22,300 income, Rs 62,900 of commitments,
  // Rs 15,000 into savings. Pool = Rs 44,400 across 28 days from 3 Sep.
  const REAL_INCOME = toPaise(122300)
  const realTracks: Track[] = [
    { id: 'daily', name: 'Daily Expenses', type: 'spending', archived: false, monthlyLimitMinor: toPaise(20000) },
    { id: 'rent', name: 'Rent', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18000), dueDay: 5 },
    { id: 'emi', name: 'Home Loan EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18400), dueDay: 28 },
    { id: 'sip15', name: 'SIP 15th', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(15000), dueDay: 15 },
    { id: 'sip6', name: 'SIP 6th', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(10000), dueDay: 6 },
    { id: 'phone', name: 'Phone', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(1500), dueDay: 10 },
    { id: 'fund', name: 'Emergency Fund', type: 'goal', archived: false, plannedMonthlyMinor: toPaise(10000), raidable: false },
    { id: 'goa', name: 'Goa Trip', type: 'project', archived: false, plannedMonthlyMinor: toPaise(5000) },
  ]

  const SEP_3 = new Date(2026, 8, 3) // 3 Sep 2026, 28 days remaining

  function realTxn(over: Partial<Transaction>): Transaction {
    return {
      id: 't', occurredOn: '2026-09-03', amountMinor: toPaise(600),
      movement: 'expense', trackId: 'daily', categoryName: 'Food',
      description: 'lunch', paymentMethod: 'upi', source: 'manual',
      createdAt: 0, deletedAt: null,
      ...over,
    }
  }

  const compute = (transactions: Transaction[], today = SEP_3) =>
    computeSafeToSpend({ monthlyIncomeMinor: REAL_INCOME, tracks: realTracks, transactions, today })

  it("reserves commitments and savings, leaving a pool to divide", () => {
    const r = compute([])
    expect(r.committedMinor).toBe(toPaise(62900))
    expect(r.plannedSavingsMinor).toBe(toPaise(15000))
    expect(r.safeToSpendMinor).toBe(toPaise(44400))
    expect(r.daysRemaining).toBe(28)
    expect(r.todayAllowanceMinor).toBe(Math.floor(toPaise(44400) / 28)) // Rs 1,585
    expect(r.leftTodayMinor).toBe(r.todayAllowanceMinor)
  })

  it("spending Rs 600 today reduces what's left today by exactly Rs 600", () => {
    const before = compute([])
    const after = compute([realTxn({ amountMinor: toPaise(600) })])

    expect(after.spentTodayMinor).toBe(toPaise(600))
    expect(before.leftTodayMinor - after.leftTodayMinor).toBe(toPaise(600))
  })

  it("does NOT move today's allowance when today is spent - only what's left of it", () => {
    // The regression this guards: dividing the whole month's remainder would make
    // today's own figure fall by 600/28 (about Rs 21) instead of by Rs 600.
    const before = compute([])
    const after = compute([realTxn({ amountMinor: toPaise(600) })])

    expect(after.todayAllowanceMinor).toBe(before.todayAllowanceMinor)
    expect(after.safeToSpendMinor).toBe(before.safeToSpendMinor - toPaise(600))
  })

  it("rolls unspent money into tomorrow by dividing across one fewer day", () => {
    // Spent Rs 600 of Rs 1,585 on the 3rd; the other Rs 985 is not lost.
    const spentYesterday = [realTxn({ occurredOn: '2026-09-03', amountMinor: toPaise(600) })]

    const day3 = compute(spentYesterday, new Date(2026, 8, 3))
    const day4 = compute(spentYesterday, new Date(2026, 8, 4))

    expect(day4.spentTodayMinor).toBe(0)
    expect(day4.daysRemaining).toBe(27)
    // Rs 43,800 over 27 days beats Rs 44,400 over 28.
    expect(day4.todayAllowanceMinor).toBeGreaterThan(day3.todayAllowanceMinor)
    expect(day4.todayAllowanceMinor).toBe(Math.floor(toPaise(43800) / 27))
  })

  it("lowers tomorrow's allowance after an overspent day", () => {
    const blowout = [realTxn({ amountMinor: toPaise(5000) })]

    const day3 = compute(blowout, new Date(2026, 8, 3))
    const day4 = compute(blowout, new Date(2026, 8, 4))

    expect(day3.leftTodayMinor).toBe(0) // never negative
    expect(day4.todayAllowanceMinor).toBeLessThan(day3.todayAllowanceMinor)
  })

  it("shows nothing left rather than a negative figure once the day is gone", () => {
    const r = compute([realTxn({ amountMinor: toPaise(9999) })])
    expect(r.leftTodayMinor).toBe(0)
    expect(r.spentTodayMinor).toBe(toPaise(9999))
  })

  it("gives a refund today back to today", () => {
    const r = compute([
      realTxn({ id: 'a', amountMinor: toPaise(1000) }),
      realTxn({ id: 'r', amountMinor: toPaise(400), movement: 'refund' }),
    ])
    expect(r.spentTodayMinor).toBe(toPaise(600))
  })

  it("ignores a commitment paid today - it was already reserved", () => {
    // Rent leaving the account must not also eat today's discretionary budget.
    const r = compute([realTxn({ trackId: 'rent', amountMinor: toPaise(18000) })])
    expect(r.spentTodayMinor).toBe(0)
    expect(r.leftTodayMinor).toBe(r.todayAllowanceMinor)
  })

  it("ignores a savings transfer today", () => {
    const r = compute([realTxn({ trackId: 'fund', amountMinor: toPaise(10000), movement: 'transfer' })])
    expect(r.spentTodayMinor).toBe(0)
  })

  it("counts only today, not yesterday", () => {
    const r = compute([
      realTxn({ id: 'y', occurredOn: '2026-09-02', amountMinor: toPaise(2000) }),
      realTxn({ id: 't', occurredOn: '2026-09-03', amountMinor: toPaise(600) }),
    ])
    expect(r.spentTodayMinor).toBe(toPaise(600))
    expect(r.spentMinor).toBe(toPaise(2600))
  })

  it("hands the whole remaining pool to the last day of the month", () => {
    const r = compute([], new Date(2026, 8, 30)) // 30 Sep, 1 day left
    expect(r.daysRemaining).toBe(1)
    expect(r.todayAllowanceMinor).toBe(toPaise(44400))
  })

  it("shows zero today when the month is already overspent", () => {
    const r = compute([realTxn({ occurredOn: '2026-09-01', amountMinor: toPaise(50000) })])
    expect(r.safeToSpendMinor).toBeLessThan(0)
    expect(r.todayAllowanceMinor).toBe(0)
    expect(r.leftTodayMinor).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Regressions found by adversarial review (see workflow verify-daily-allowance)
// ---------------------------------------------------------------------------

describe('refund-day edge cases', () => {
  const tks: Track[] = [
    { id: 'daily', name: 'Daily', type: 'spending', archived: false },
    { id: 'emi', name: 'EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(1000), dueDay: 5 },
  ]
  const SEP_3 = new Date(2026, 8, 3)

  const t = (over: Partial<Transaction>): Transaction => ({
    id: 't', occurredOn: '2026-09-03', amountMinor: toPaise(400),
    movement: 'expense', trackId: 'daily', categoryName: 'Food',
    description: 'x', paymentMethod: 'upi', source: 'manual',
    createdAt: 0, deletedAt: null, ...over,
  })

  it('lets spentToday go negative on a net-refund day', () => {
    // The card must clamp the progress bar for this; a negative width is
    // invalid CSS, gets dropped, and the bar renders 100% full.
    const r = computeSafeToSpend({
      monthlyIncomeMinor: toPaise(50000), tracks: tks,
      transactions: [t({ movement: 'refund' })], today: SEP_3,
    })
    expect(r.spentTodayMinor).toBe(-toPaise(400))
    expect(r.leftTodayMinor).toBeGreaterThan(r.todayAllowanceMinor)
  })

  it('never produces NaN from a zero allowance', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: 0, tracks: tks, transactions: [], today: SEP_3,
    })
    expect(r.todayAllowanceMinor).toBe(0)
    expect(Number.isNaN(r.leftTodayMinor)).toBe(false)
    expect(r.leftTodayMinor).toBe(0)
  })
})

describe('malformed dates cannot silently vanish money', () => {
  const tks: Track[] = [{ id: 'daily', name: 'Daily', type: 'spending', archived: false }]
  const SEP_3 = new Date(2026, 8, 3)

  const t = (occurredOn: string): Transaction => ({
    id: 'x', occurredOn, amountMinor: toPaise(3000), movement: 'expense',
    trackId: 'daily', categoryName: 'Food', description: 'x',
    paymentMethod: 'upi', source: 'manual', createdAt: 0, deletedAt: null,
  })

  it('excludes a blank date from every aggregate - which is why writing one is blocked', () => {
    // Documents the hazard: '' matches no month and no day, so the row would be
    // listed in the ledger yet invisible to Safe-to-Spend forever. QuickAdd now
    // substitutes today rather than ever writing this.
    expect(isInMonth('', SEP_3)).toBe(false)
    expect(isSameDay('', SEP_3)).toBe(false)
    const r = computeSafeToSpend({
      monthlyIncomeMinor: toPaise(50000), tracks: tks, transactions: [t('')], today: SEP_3,
    })
    expect(r.spentMinor).toBe(0)
  })

  it('treats a timestamped date as not-today', () => {
    expect(isSameDay('2026-09-03T18:30:00Z', SEP_3)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Balance basis: what you HOLD, not what you were paid
// ---------------------------------------------------------------------------

describe('Safe-to-Spend from the account balance', () => {
  const tks: Track[] = [
    { id: 'daily', name: 'Daily', type: 'spending', archived: false, monthlyLimitMinor: toPaise(20000) },
    { id: 'rent', name: 'Rent', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18000), dueDay: 5 },
    { id: 'sip', name: 'SIP', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(15000), dueDay: 15 },
    { id: 'fund', name: 'Emergency Fund', type: 'goal', archived: false, plannedMonthlyMinor: toPaise(10000) },
  ]

  const SEP_10 = new Date(2026, 8, 10) // 21 days remaining

  const t = (over: Partial<Transaction>): Transaction => ({
    id: 'x', occurredOn: '2026-09-08', amountMinor: toPaise(1000),
    movement: 'expense', trackId: 'daily', categoryName: 'Food',
    description: 'x', paymentMethod: 'upi', source: 'manual',
    createdAt: 0, deletedAt: null, ...over,
  })

  const fromBalance = (transactions: Transaction[], cash: number, owed = 0) =>
    computeSafeToSpend({
      monthlyIncomeMinor: toPaise(122300), tracks: tks, transactions,
      today: SEP_10, cashMinor: cash, owedMinor: owed,
    })

  it('uses the balance, not the typed income', () => {
    const r = fromBalance([], toPaise(80000))
    expect(r.basis).toBe('balance')
    // 80,000 held - 33,000 commitments still due - 10,000 savings still to move
    expect(r.safeToSpendMinor).toBe(toPaise(37000))
  })

  it('does NOT subtract what has already been spent - the balance already did', () => {
    // The double-count this basis exists to avoid. Spending Rs 5,000 lowers the
    // balance; subtracting it again would deduct the same money twice.
    const spent = [t({ amountMinor: toPaise(5000) })]
    expect(fromBalance(spent, toPaise(75000)).safeToSpendMinor).toBe(toPaise(32000))
  })

  it('stops subtracting a commitment once it has actually been paid', () => {
    // Rent went out: the balance dropped by 18,000, so it must not also be
    // reserved. Otherwise rent is deducted twice.
    const paidRent = [t({ trackId: 'rent', amountMinor: toPaise(18000), occurredOn: '2026-09-05' })]
    const r = fromBalance(paidRent, toPaise(62000))
    expect(r.committedRemainingMinor).toBe(toPaise(15000)) // only the SIP left
    expect(r.safeToSpendMinor).toBe(toPaise(37000))
  })

  it('stops subtracting savings once they have been transferred', () => {
    const moved = [
      t({ movement: 'transfer', trackId: 'fund', toTrackId: 'fund', amountMinor: toPaise(10000) }),
    ]
    const r = fromBalance(moved, toPaise(70000))
    expect(r.savingsRemainingMinor).toBe(0)
    expect(r.safeToSpendMinor).toBe(toPaise(37000))
  })

  it('treats a partly-paid commitment as partly remaining', () => {
    const half = [t({ trackId: 'rent', amountMinor: toPaise(8000) })]
    expect(fromBalance(half, toPaise(72000)).committedRemainingMinor).toBe(toPaise(25000))
  })

  it('never lets an overpaid commitment create spendable money', () => {
    const over = [t({ trackId: 'rent', amountMinor: toPaise(25000) })]
    expect(fromBalance(over, toPaise(55000)).committedRemainingMinor).toBe(toPaise(15000))
  })

  it('subtracts card debt as the liability it is', () => {
    expect(fromBalance([], toPaise(80000), toPaise(7000)).safeToSpendMinor).toBe(toPaise(30000))
  })

  it('rises when the salary lands, because the balance rose', () => {
    const before = fromBalance([], toPaise(20000)).safeToSpendMinor
    const after = fromBalance([], toPaise(142300)).safeToSpendMinor
    expect(after - before).toBe(toPaise(122300))
  })

  it('keeps the daily allowance and rollover working on the new basis', () => {
    const spentToday = [t({ occurredOn: '2026-09-10', amountMinor: toPaise(600) })]
    const r = fromBalance(spentToday, toPaise(79400))

    // Balance this morning was 80,000; pool 37,000 across 21 days.
    expect(r.daysRemaining).toBe(21)
    expect(r.todayAllowanceMinor).toBe(Math.floor(toPaise(37000) / 21))
    expect(r.leftTodayMinor).toBe(r.todayAllowanceMinor - toPaise(600))
  })

  it('falls back to income when no cash figure is given', () => {
    // undefined selects the fallback; zero would mean "you have nothing".
    const r = computeSafeToSpend({
      monthlyIncomeMinor: toPaise(122300), tracks: tks, transactions: [], today: SEP_10,
    })
    expect(r.basis).toBe('income')
    expect(r.safeToSpendMinor).toBe(toPaise(122300 - 33000 - 10000))
  })

  it('reports an overdrawn account honestly rather than clamping', () => {
    const r = fromBalance([], toPaise(1000))
    expect(r.safeToSpendMinor).toBeLessThan(0)
    expect(r.leftTodayMinor).toBe(0)
  })
})
