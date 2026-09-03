import { describe, expect, it } from 'vitest'

import {
  computeSafeToSpend,
  daysRemainingInMonth,
  isInMonth,
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
