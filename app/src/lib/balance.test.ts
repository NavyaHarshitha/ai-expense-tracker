import { describe, expect, it } from 'vitest'

import { computeBalance, trackHoldingMinor } from './balance'
import { toPaise } from './money'
import type { Track, Transaction } from './types'

const tracks: Track[] = [
  { id: 'daily', name: 'Daily', type: 'spending', archived: false },
  { id: 'emi', name: 'EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18400), dueDay: 28 },
  { id: 'mf', name: 'Mutual Funds', type: 'goal', archived: false, openingBalanceMinor: toPaise(60000) },
  { id: 'goa', name: 'Goa Trip', type: 'project', archived: false },
]

const t = (over: Partial<Transaction>): Transaction => ({
  id: 'x', occurredOn: '2026-09-03', amountMinor: toPaise(500),
  movement: 'expense', trackId: 'daily', categoryName: 'Food',
  description: 'x', paymentMethod: 'upi', source: 'manual',
  createdAt: 0, deletedAt: null, ...over,
})

const anchored = (transactions: Transaction[]) =>
  computeBalance({
    anchorMinor: toPaise(84000), anchorOn: '2026-09-01', transactions, tracks,
  })

describe('computeBalance', () => {
  it('reports unset before any anchor exists, rather than a confident zero', () => {
    const r = computeBalance({ anchorMinor: undefined, anchorOn: undefined, transactions: [], tracks })
    expect(r.unset).toBe(true)
    expect(r.balanceMinor).toBe(0)
  })

  it('returns the anchor untouched when nothing has happened since', () => {
    expect(anchored([]).balanceMinor).toBe(toPaise(84000))
  })

  it('subtracts expenses and adds income', () => {
    const r = anchored([
      t({ id: 'a', amountMinor: toPaise(600) }),
      t({ id: 'b', amountMinor: toPaise(122300), movement: 'income' }),
    ])
    expect(r.balanceMinor).toBe(toPaise(84000 - 600 + 122300))
    expect(r.countedRows).toBe(2)
  })

  it('counts a commitment payment - the EMI really does debit', () => {
    // Deliberately unlike Safe-to-Spend, which excludes commitment-track
    // expenses because they were reserved up front.
    const r = anchored([t({ trackId: 'emi', amountMinor: toPaise(18400) })])
    expect(r.balanceMinor).toBe(toPaise(84000 - 18400))
  })

  it('treats a transfer into savings as money leaving the bank', () => {
    const r = anchored([
      t({ movement: 'transfer', trackId: 'mf', toTrackId: 'mf', amountMinor: toPaise(15000) }),
    ])
    expect(r.outMinor).toBe(toPaise(15000))
    expect(r.balanceMinor).toBe(toPaise(84000 - 15000))
  })

  it('ignores a transfer between two spending tracks', () => {
    const r = anchored([
      t({ movement: 'transfer', trackId: 'daily', toTrackId: 'daily', amountMinor: toPaise(1000) }),
    ])
    expect(r.balanceMinor).toBe(toPaise(84000))
    expect(r.countedRows).toBe(0)
  })

  it('adds a refund back', () => {
    const r = anchored([t({ movement: 'refund', amountMinor: toPaise(400) })])
    expect(r.balanceMinor).toBe(toPaise(84400))
  })

  it('ignores anything dated before the anchor - that is what re-anchoring is for', () => {
    const r = anchored([t({ occurredOn: '2026-08-31', amountMinor: toPaise(9999) })])
    expect(r.balanceMinor).toBe(toPaise(84000))
    expect(r.countedRows).toBe(0)
  })

  it('includes rows dated on the anchor date itself', () => {
    const r = anchored([t({ occurredOn: '2026-09-01', amountMinor: toPaise(1000) })])
    expect(r.balanceMinor).toBe(toPaise(83000))
  })

  it('ignores soft-deleted and blank-dated rows', () => {
    const r = anchored([
      t({ id: 'gone', amountMinor: toPaise(5000), deletedAt: 1 }),
      t({ id: 'blank', occurredOn: '', amountMinor: toPaise(5000) }),
    ])
    expect(r.balanceMinor).toBe(toPaise(84000))
  })

  it('can go negative - an overdrawn account is a real state', () => {
    const r = anchored([t({ amountMinor: toPaise(90000) })])
    expect(r.balanceMinor).toBeLessThan(0)
  })
})

describe('trackHoldingMinor', () => {
  const mf = tracks.find((x) => x.id === 'mf')!

  it('starts from the opening balance, so existing holdings need no fake transfer', () => {
    expect(trackHoldingMinor(mf, [])).toBe(toPaise(60000))
  })

  it('adds transfers in on top of the opening balance', () => {
    const held = trackHoldingMinor(mf, [
      t({ movement: 'transfer', trackId: 'mf', toTrackId: 'mf', amountMinor: toPaise(15000) }),
    ])
    expect(held).toBe(toPaise(75000))
  })

  it('subtracts money spent out of the track', () => {
    const goa = tracks.find((x) => x.id === 'goa')!
    const held = trackHoldingMinor(goa, [
      t({ movement: 'transfer', trackId: 'goa', toTrackId: 'goa', amountMinor: toPaise(30000) }),
      t({ trackId: 'goa', amountMinor: toPaise(4000) }),
    ])
    expect(held).toBe(toPaise(26000))
  })

  it('is zero for a track with no opening balance and no movements', () => {
    expect(trackHoldingMinor(tracks[0], [])).toBe(0)
  })

  it('ignores other tracks and deleted rows', () => {
    const held = trackHoldingMinor(mf, [
      t({ movement: 'transfer', trackId: 'goa', toTrackId: 'goa', amountMinor: toPaise(5000) }),
      t({ movement: 'transfer', trackId: 'mf', toTrackId: 'mf', amountMinor: toPaise(5000), deletedAt: 1 }),
    ])
    expect(held).toBe(toPaise(60000))
  })
})
