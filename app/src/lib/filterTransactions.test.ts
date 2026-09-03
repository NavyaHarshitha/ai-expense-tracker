import { describe, expect, it } from 'vitest'

import {
  EMPTY_FILTERS,
  categoryCounts,
  filterIndexed,
  hasActiveFilters,
  indexTransactions,
  netSpendOf,
} from './filterTransactions'
import { toPaise } from './money'
import type { Transaction } from './types'

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 't', occurredOn: '2026-08-10', amountMinor: toPaise(500),
    movement: 'expense', trackId: 'daily', categoryName: 'Food',
    description: 'Swiggy', paymentMethod: 'upi', source: 'manual',
    createdAt: 0, deletedAt: null,
    ...over,
  }
}

const rows: Transaction[] = [
  txn({ id: '1', categoryName: 'Food', description: 'Swiggy', amountMinor: toPaise(400) }),
  txn({ id: '2', categoryName: 'Food', description: 'Chai', amountMinor: toPaise(40), note: 'with Ravi' }),
  txn({ id: '3', categoryName: 'Transport', description: 'Uber', amountMinor: toPaise(220), paymentMethod: 'card' }),
  txn({ id: '4', categoryName: 'Groceries', description: 'BigBasket', amountMinor: toPaise(1800), trackId: 'other' }),
  txn({ id: '5', categoryName: 'Food', description: 'Refund from Zomato', amountMinor: toPaise(100), movement: 'refund' }),
]

const indexed = indexTransactions(rows)

const ids = (out: Transaction[]) => out.map((t) => t.id)

describe('filterIndexed', () => {
  it('returns everything when no filter is set', () => {
    expect(ids(filterIndexed(indexed, EMPTY_FILTERS))).toEqual(['1', '2', '3', '4', '5'])
  })

  it('filters by category', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, category: 'Food' }))).toEqual(['1', '2', '5'])
  })

  it('filters by track', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, track: 'other' }))).toEqual(['4'])
  })

  it('filters by movement type', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, movement: 'refund' }))).toEqual(['5'])
  })

  it('searches description', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, query: 'uber' }))).toEqual(['3'])
  })

  it('searches notes too, so the "why" is findable', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, query: 'ravi' }))).toEqual(['2'])
  })

  it('searches payment method', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, query: 'card' }))).toEqual(['3'])
  })

  it('is case insensitive and trims the query', () => {
    expect(ids(filterIndexed(indexed, { ...EMPTY_FILTERS, query: '  SWIGGY ' }))).toEqual(['1'])
  })

  it('combines filters with AND', () => {
    expect(
      ids(filterIndexed(indexed, { ...EMPTY_FILTERS, category: 'Food', query: 'chai' })),
    ).toEqual(['2'])

    // Category and query that don't intersect -> nothing.
    expect(
      ids(filterIndexed(indexed, { ...EMPTY_FILTERS, category: 'Transport', query: 'chai' })),
    ).toEqual([])
  })

  it('returns an empty array rather than throwing on no matches', () => {
    expect(filterIndexed(indexed, { ...EMPTY_FILTERS, query: 'zzzz' })).toEqual([])
  })
})

describe('categoryCounts', () => {
  it('counts rows and nets amounts per category, biggest spend first', () => {
    const counts = categoryCounts(rows)

    expect(counts.map((c) => c.name)).toEqual(['Groceries', 'Food', 'Transport'])

    const food = counts.find((c) => c.name === 'Food')!
    expect(food.count).toBe(3)
    // 400 + 40 - 100 refund
    expect(food.totalMinor).toBe(toPaise(340))
  })

  it('handles an empty ledger', () => {
    expect(categoryCounts([])).toEqual([])
  })
})

describe('netSpendOf', () => {
  it('nets refunds and ignores transfers and income', () => {
    expect(netSpendOf(rows)).toBe(toPaise(400 + 40 + 220 + 1800 - 100))

    expect(
      netSpendOf([
        txn({ movement: 'income', amountMinor: toPaise(90000) }),
        txn({ movement: 'transfer', amountMinor: toPaise(10000) }),
      ]),
    ).toBe(0)
  })
})

describe('hasActiveFilters', () => {
  it('is false only when nothing is set', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '   ' })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, category: 'Food' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'a' })).toBe(true)
  })
})

describe('indexTransactions', () => {
  it('builds one lowercased haystack per row', () => {
    const [first] = indexTransactions([txn({ description: 'Swiggy', note: 'Late Dinner' })])
    expect(first.haystack).toContain('swiggy')
    expect(first.haystack).toContain('late dinner')
    expect(first.haystack).toContain('food')
    expect(first.haystack).toBe(first.haystack.toLowerCase())
  })
})
