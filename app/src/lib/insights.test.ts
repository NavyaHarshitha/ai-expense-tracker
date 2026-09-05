import { describe, expect, it } from 'vitest'

import { buildInsights, categoryBreakdown, dailySeries, monthSummary } from './insights'
import { toPaise } from './money'
import { spentThisMonthMinor } from './safeToSpend'
import type { Track, Transaction } from './types'

const AUG_15 = new Date(2026, 7, 15)

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't', occurredOn: '2026-08-10', amountMinor: toPaise(500),
    movement: 'expense', trackId: 'daily', categoryName: 'Food',
    description: 'lunch', paymentMethod: 'upi', source: 'manual',
    createdAt: 0, deletedAt: null,
    ...over,
  }
}

const tracks: Track[] = [
  { id: 'daily', name: 'Daily Expenses', type: 'spending', archived: false, monthlyLimitMinor: toPaise(20000) },
  { id: 'fund', name: 'Emergency Fund', type: 'goal', archived: false, targetMinor: toPaise(300000), raidable: false },
]

describe('categoryBreakdown', () => {
  it('groups by category, largest first, with shares summing to 1', () => {
    const b = categoryBreakdown(
      [
        txn({ id: 'a', categoryName: 'Food', amountMinor: toPaise(3000) }),
        txn({ id: 'b', categoryName: 'Transport', amountMinor: toPaise(1000) }),
        txn({ id: 'c', categoryName: 'Food', amountMinor: toPaise(1000) }),
      ],
      tracks,
      AUG_15,
    )

    expect(b.map((s) => s.name)).toEqual(['Food', 'Transport'])
    expect(b[0].valueMinor).toBe(toPaise(4000))
    expect(b[0].share).toBeCloseTo(0.8)
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })

  it('nets refunds against their category', () => {
    const b = categoryBreakdown(
      [
        txn({ id: 'a', categoryName: 'Shopping', amountMinor: toPaise(5000) }),
        txn({ id: 'r', categoryName: 'Shopping', amountMinor: toPaise(2000), movement: 'refund' }),
      ],
      tracks,
      AUG_15,
    )
    expect(b[0].valueMinor).toBe(toPaise(3000))
  })

  it('ignores income and transfers', () => {
    const b = categoryBreakdown(
      [
        txn({ id: 'i', movement: 'income', amountMinor: toPaise(90000), categoryName: 'Other' }),
        txn({ id: 'x', movement: 'transfer', amountMinor: toPaise(10000), categoryName: 'Other' }),
      ],
      tracks,
      AUG_15,
    )
    expect(b).toEqual([])
  })

  it('excludes other months', () => {
    const b = categoryBreakdown(
      [txn({ occurredOn: '2026-07-20' })], tracks, AUG_15)
    expect(b).toEqual([])
  })
})

describe('dailySeries', () => {
  it('produces one point per elapsed day', () => {
    const s = dailySeries([txn({ occurredOn: '2026-08-03', amountMinor: toPaise(900) })], tracks, AUG_15)
    expect(s).toHaveLength(15)
    expect(s[2].spentMinor).toBe(toPaise(900))
    expect(s[0].spentMinor).toBe(0)
  })

  it('never shows a negative day', () => {
    const s = dailySeries(
      [txn({ occurredOn: '2026-08-03', amountMinor: toPaise(900), movement: 'refund' })],
      tracks,
      AUG_15,
    )
    expect(s[2].spentMinor).toBe(0)
  })
})

describe('monthSummary', () => {
  it('reports total, count, highest and top category', () => {
    const s = monthSummary(
      [
        txn({ id: 'a', amountMinor: toPaise(1200), categoryName: 'Food' }),
        txn({ id: 'b', amountMinor: toPaise(4500), categoryName: 'Shopping' }),
        txn({ id: 'c', amountMinor: toPaise(300), categoryName: 'Food' }),
      ],
      tracks,
      AUG_15,
    )
    expect(s.totalSpentMinor).toBe(toPaise(6000))
    expect(s.count).toBe(3)
    expect(s.highestMinor).toBe(toPaise(4500))
    expect(s.topCategory).toBe('Shopping')
  })

  it('says None when there is nothing', () => {
    expect(monthSummary([], tracks, AUG_15).topCategory).toBe('None')
  })
})

describe('buildInsights', () => {
  it('names the biggest category', () => {
    const out = buildInsights({
      tracks, transactions: [txn({ amountMinor: toPaise(3000), categoryName: 'Groceries' })],
      today: AUG_15, safeToSpendMinor: toPaise(10000), daysRemaining: 17,
    })
    expect(out.find((i) => i.id === 'top-category')?.title).toContain('Groceries')
  })

  it('projects a burn-rate warning forward to a date', () => {
    // ₹15,000 by the 15th = ₹1,000/day against a ₹20,000 limit -> crosses on the 20th.
    const out = buildInsights({
      tracks, transactions: [txn({ amountMinor: toPaise(15000) })],
      today: AUG_15, safeToSpendMinor: toPaise(1000), daysRemaining: 17,
    })
    const burn = out.find((i) => i.id.startsWith('burn-'))
    expect(burn?.tone).toBe('warn')
    expect(burn?.title).toContain('20')
  })

  it('is reassuring when well under the limit', () => {
    const out = buildInsights({
      tracks, transactions: [txn({ amountMinor: toPaise(2000) })],
      today: AUG_15, safeToSpendMinor: toPaise(40000), daysRemaining: 17,
    })
    expect(out.find((i) => i.id.startsWith('burn-ok-'))?.tone).toBe('good')
  })

  it('flags being past safe-to-spend', () => {
    const out = buildInsights({
      tracks, transactions: [], today: AUG_15, safeToSpendMinor: -toPaise(500), daysRemaining: 17,
    })
    expect(out.find((i) => i.id === 'over')).toBeTruthy()
  })

  it('mentions locked goals so advice never suggests raiding them', () => {
    const out = buildInsights({
      tracks, transactions: [], today: AUG_15, safeToSpendMinor: toPaise(100), daysRemaining: 17,
    })
    expect(out.find((i) => i.id === 'locked')?.title).toContain('Emergency Fund')
  })

  it('compares against last month when there is history', () => {
    const out = buildInsights({
      tracks,
      transactions: [
        txn({ id: 'now', occurredOn: '2026-08-10', amountMinor: toPaise(2000) }),
        txn({ id: 'prev', occurredOn: '2026-07-10', amountMinor: toPaise(1000) }),
      ],
      today: AUG_15, safeToSpendMinor: toPaise(1000), daysRemaining: 17,
    })
    expect(out.find((i) => i.id === 'month-trend')?.title).toContain('up 100%')
  })
})

describe('commitments are excluded from the dashboard, as they are from Safe-to-Spend', () => {
  // The inconsistency this fixes: a Rs 15,000 SIP was reserved up front AND
  // counted as spending, so "Total Spent" and "Highest Expense" were dominated
  // by a standing order nobody was going to skip.
  const withEmi: Track[] = [
    ...tracks,
    { id: 'sip', name: 'Bandhan Small Cap', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(15000), dueDay: 1 },
  ]

  const rows = [
    txn({ id: 'sip1', trackId: 'sip', amountMinor: toPaise(15000), categoryName: 'Mutual Fund' }),
    txn({ id: 'a', amountMinor: toPaise(1200), categoryName: 'Food' }),
    txn({ id: 'b', amountMinor: toPaise(300), categoryName: 'Transport' }),
  ]

  it('leaves the SIP out of the spend total, and reports it separately', () => {
    const s = monthSummary(rows, withEmi, AUG_15)
    expect(s.totalSpentMinor).toBe(toPaise(1500))
    expect(s.committedPaidMinor).toBe(toPaise(15000))
  })

  it('does not call a standing order the highest expense of the month', () => {
    expect(monthSummary(rows, withEmi, AUG_15).highestMinor).toBe(toPaise(1200))
  })

  it('counts only discretionary entries', () => {
    expect(monthSummary(rows, withEmi, AUG_15).count).toBe(2)
  })

  it('keeps the SIP out of the category donut, so it shows what can be changed', () => {
    const b = categoryBreakdown(rows, withEmi, AUG_15)
    expect(b.map((c) => c.name)).toEqual(['Food', 'Transport'])
    expect(b.find((c) => c.name === 'Mutual Fund')).toBeUndefined()
  })

  it('keeps the SIP out of the daily bars', () => {
    const series = dailySeries(rows, withEmi, AUG_15)
    const total = series.reduce((sum, d) => sum + d.spentMinor, 0)
    expect(total).toBe(toPaise(1500))
  })

  it('matches what Safe-to-Spend counts, which was the whole point', () => {
    const s = monthSummary(rows, withEmi, AUG_15)
    expect(s.totalSpentMinor).toBe(spentThisMonthMinor(rows, withEmi, AUG_15))
  })

  it('reports zero commitments paid when none have gone out', () => {
    expect(monthSummary([rows[1]], withEmi, AUG_15).committedPaidMinor).toBe(0)
  })
})
