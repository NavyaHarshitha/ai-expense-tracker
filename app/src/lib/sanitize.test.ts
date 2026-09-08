/*
Hostile-input tests.

Every case here is a real defect found by throwing adversarial data at the pure
core, not a hypothetical. They are kept as tests because the failure mode of
each was silent: a wrong number that still rendered, or a crash with no message.
*/

import { describe, expect, it } from 'vitest'

import { accountBalance, summariseAccounts } from './accounts'
import { MAX_AMOUNT_MINOR, formatINR, toAmountMinor, toPaise } from './money'
import {
  computeSafeToSpend,
  daysRemainingInMonth,
  isInMonth,
  isSameDay,
  spentThisMonthMinor,
} from './safeToSpend'
import { safeDate, safeInt, toAccount, toCategory, toTrack, toTransaction } from './sanitize'
import type { Account, Track, Transaction } from './types'

const TODAY = new Date(2026, 8, 9) // 9 Sep 2026, local

describe('toPaise / toAmountMinor', () => {
  it('parses the ordinary cases', () => {
    expect(toPaise('250')).toBe(25000)
    expect(toPaise('250.50')).toBe(25050)
    expect(toPaise(' 1,200 ')).toBe(120000)
    expect(toPaise('₹250.50')).toBe(25050)
    expect(toPaise('1,00,000')).toBe(10000000)
  })

  it('returns 0 rather than NaN for anything unparseable', () => {
    for (const junk of ['', '   ', 'abc', 'NaN', 'Infinity', '1e400', '٢٥٠']) {
      expect(toPaise(junk)).toBe(0)
    }
    expect(toPaise(Number.NaN)).toBe(0)
    expect(toPaise(Number.POSITIVE_INFINITY)).toBe(0)
  })

  /*
  '999999999999999' became 99999999999999900 paise - past Number.MAX_SAFE_INTEGER,
  where addition silently stops being exact. Every total downstream inherited the
  error with no visible symptom.
  */
  it('clamps beyond the safe-integer range instead of losing precision', () => {
    expect(toPaise('999999999999999')).toBe(MAX_AMOUNT_MINOR)
    expect(toPaise('1e15')).toBe(MAX_AMOUNT_MINOR)
    expect(toPaise('-999999999999999')).toBe(-MAX_AMOUNT_MINOR)
    expect(MAX_AMOUNT_MINOR).toBeLessThan(Number.MAX_SAFE_INTEGER)
    // Headroom to sum a large ledger without leaving exact-integer territory.
    expect(MAX_AMOUNT_MINOR * 100_000).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })

  /*
  amountMinor is documented as always positive, with direction carried by
  `movement`. A negative expense does not subtract less - it ADDS money to every
  total that subtracts it, conjuring spendable cash out of a typo.
  */
  it('never yields a negative transaction amount', () => {
    expect(toAmountMinor('-500')).toBe(50000)
    expect(toAmountMinor(-500)).toBe(50000)
    expect(toAmountMinor('abc')).toBe(0)
    // toPaise itself keeps the sign, because a balance may legitimately be negative.
    expect(toPaise('-500')).toBe(-50000)
  })
})

describe('formatINR', () => {
  it('never renders NaN or Infinity to the user', () => {
    expect(formatINR(Number.NaN)).toBe('₹—')
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe('₹—')
    expect(formatINR(Number.NEGATIVE_INFINITY)).toBe('₹—')
  })

  it('still formats real amounts in the Indian grouping', () => {
    expect(formatINR(10000000)).toBe('₹1,00,000')
    expect(formatINR(0)).toBe('₹0')
  })
})

describe('date predicates are total', () => {
  /*
  These threw on undefined. Thrown inside a useMemo during render, that unmounts
  the whole tree - so one Firestore document missing occurredOn turned the entire
  app into a blank white page.
  */
  it('does not throw on missing or malformed dates', () => {
    for (const bad of [undefined, null, '', 'garbage', '2026-13-45', '0000-00-00']) {
      expect(() => isInMonth(bad as never, TODAY)).not.toThrow()
      expect(() => isSameDay(bad as never, TODAY)).not.toThrow()
      expect(isInMonth(bad as never, TODAY)).toBe(false)
      expect(isSameDay(bad as never, TODAY)).toBe(false)
    }
  })

  it('still matches real dates', () => {
    expect(isInMonth('2026-09-01', TODAY)).toBe(true)
    expect(isSameDay('2026-09-09', TODAY)).toBe(true)
    expect(isInMonth('2026-08-31', TODAY)).toBe(false)
  })
})

describe('safeInt / safeDate', () => {
  it('rejects every non-finite value', () => {
    expect(safeInt(Number.NaN)).toBe(0)
    expect(safeInt(undefined)).toBe(0)
    expect(safeInt(null)).toBe(0)
    expect(safeInt('nonsense')).toBe(0)
    expect(safeInt(Number.POSITIVE_INFINITY)).toBe(0)
    expect(safeInt('4200')).toBe(4200)
    expect(safeInt(12.7)).toBe(13)
  })

  it('accepts only dates the calendar actually contains', () => {
    expect(safeDate('2026-09-09')).toBe('2026-09-09')
    expect(safeDate('2026-09-09T10:30:00Z')).toBe('2026-09-09')
    expect(safeDate('2028-02-29')).toBe('2028-02-29') // a real leap day
    expect(safeDate('2026-02-29')).toBeUndefined() // 2026 is not a leap year
    expect(safeDate('2026-13-01')).toBeUndefined()
    expect(safeDate('2026-09-31')).toBeUndefined()
    expect(safeDate('2026-9-9')).toBeUndefined() // unpadded is not ISO
    expect(safeDate(undefined)).toBeUndefined()
    expect(safeDate(12345)).toBeUndefined()
  })
})

describe('toTransaction', () => {
  const good = {
    occurredOn: '2026-09-09',
    amountMinor: 25000,
    movement: 'expense',
    trackId: 't1',
    categoryName: 'Food',
    description: 'Lunch',
    paymentMethod: 'upi',
    source: 'manual',
    createdAt: 1_700_000_000_000,
  }

  it('passes a well-formed row through unchanged', () => {
    const t = toTransaction('a', good)!
    expect(t.amountMinor).toBe(25000)
    expect(t.movement).toBe('expense')
    expect(t.deletedAt).toBeNull()
  })

  it('drops rows whose date or amount cannot be trusted', () => {
    expect(toTransaction('a', { ...good, occurredOn: undefined })).toBeNull()
    expect(toTransaction('a', { ...good, occurredOn: '' })).toBeNull()
    expect(toTransaction('a', { ...good, occurredOn: 'nonsense' })).toBeNull()
    expect(toTransaction('a', { ...good, amountMinor: undefined })).toBeNull()
    expect(toTransaction('a', { ...good, amountMinor: 'lots' })).toBeNull()
  })

  it('repairs a NaN amount rather than letting it poison totals', () => {
    // NaN is a number, so it survives the typeof check and must be caught by value.
    expect(toTransaction('a', { ...good, amountMinor: Number.NaN })).toBeNull()
  })

  it('forces the amount positive and the enums valid', () => {
    const t = toTransaction('a', {
      ...good,
      amountMinor: -25000,
      movement: 'wormhole',
      paymentMethod: 'crypto',
      source: 'hacker',
    })!
    expect(t.amountMinor).toBe(25000)
    expect(t.movement).toBe('expense')
    expect(t.paymentMethod).toBe('upi')
    expect(t.source).toBe('manual')
  })

  it('defaults a missing category rather than dropping the row', () => {
    expect(toTransaction('a', { ...good, categoryName: undefined })!.categoryName).toBe('Other')
  })
})

describe('toTrack / toAccount / toCategory', () => {
  it('drops only the unnamed', () => {
    expect(toTrack('t', { name: '  ' })).toBeNull()
    expect(toAccount('a', {})).toBeNull()
    expect(toCategory('c', { name: '' })).toBeNull()
  })

  it('rejects impossible due days', () => {
    expect(toTrack('t', { name: 'Rent', type: 'commitment', dueDay: 0 })!.dueDay).toBeUndefined()
    expect(toTrack('t', { name: 'Rent', type: 'commitment', dueDay: 45 })!.dueDay).toBeUndefined()
    expect(toTrack('t', { name: 'Rent', type: 'commitment', dueDay: 5 })!.dueDay).toBe(5)
  })

  /*
  Account balances filter on `occurredOn >= openingOn`. When openingOn was
  undefined that comparison is false for every row, so the balance froze at the
  opening figure for ever and no expense ever moved it. The epoch includes
  everything, which is visibly odd rather than invisibly stuck.
  */
  it('falls back to the epoch when an account has no opening date', () => {
    expect(toAccount('a', { name: 'HDFC' })!.openingOn).toBe('1970-01-01')
  })
})

describe('aggregates survive a hostile ledger', () => {
  const track: Track = { id: 't1', name: 'Daily', type: 'spending', archived: false }

  const row = (o: Partial<Transaction>): Transaction => ({
    id: 'x',
    occurredOn: '2026-09-09',
    amountMinor: 10000,
    movement: 'expense',
    trackId: 't1',
    categoryName: 'Food',
    description: '',
    paymentMethod: 'upi',
    source: 'manual',
    createdAt: 0,
    ...o,
  })

  it('produces a finite figure for an empty ledger', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: 0,
      tracks: [],
      transactions: [],
      today: TODAY,
    })
    expect(Number.isFinite(r.safeToSpendMinor)).toBe(true)
    expect(Number.isFinite(r.todayAllowanceMinor)).toBe(true)
    expect(r.leftTodayMinor).toBe(0)
  })

  /*
  The end-to-end proof of the sanitising boundary: rows exactly like these are
  what made the hero read "₹NaN". Sanitised, the bad ones are gone and the good
  one is still counted.
  */
  it('a poisoned row cannot make a total NaN once sanitised', () => {
    const rawRows = [
      { occurredOn: '2026-09-09', amountMinor: Number.NaN, movement: 'expense', trackId: 't1' },
      { occurredOn: undefined, amountMinor: 50000, movement: 'expense', trackId: 't1' },
      { occurredOn: '2026-09-09', amountMinor: 30000, movement: 'expense', trackId: 't1' },
    ]
    const clean = rawRows
      .map((r, i) => toTransaction(String(i), r))
      .filter((t): t is Transaction => t !== null)

    expect(clean).toHaveLength(1)

    const r = computeSafeToSpend({
      monthlyIncomeMinor: 5_000_000,
      tracks: [track],
      transactions: clean,
      today: TODAY,
    })
    expect(Number.isNaN(r.spentMinor)).toBe(false)
    expect(r.spentMinor).toBe(30000)
    expect(formatINR(r.safeToSpendMinor)).not.toContain('NaN')
  })

  it('never divides by zero on the last day of any month', () => {
    for (const d of [
      new Date(2026, 8, 30),
      new Date(2026, 0, 31),
      new Date(2028, 1, 29),
      new Date(2026, 11, 31),
    ]) {
      expect(daysRemainingInMonth(d)).toBe(1)
    }
  })

  it('holds up when every account is overdrawn', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: 0,
      tracks: [],
      transactions: [],
      today: TODAY,
      cashMinor: -500000,
      owedMinor: 2000000,
    })
    expect(r.safeToSpendMinor).toBe(-2500000)
    // A negative pool must not produce a negative allowance or a negative bar.
    expect(r.todayAllowanceMinor).toBe(0)
    expect(r.leftTodayMinor).toBe(0)
  })

  it('a refund larger than the day never yields a negative allowance', () => {
    const r = computeSafeToSpend({
      monthlyIncomeMinor: 5_000_000,
      tracks: [track],
      transactions: [row({ movement: 'refund', amountMinor: 200000 })],
      today: TODAY,
    })
    expect(r.spentTodayMinor).toBeLessThan(0)
    expect(r.leftTodayMinor).toBeGreaterThanOrEqual(0)
    expect(r.todayAllowanceMinor).toBeGreaterThanOrEqual(0)
  })

  it('ignores rows dated outside the month', () => {
    expect(
      spentThisMonthMinor([row({ occurredOn: '2026-08-15', amountMinor: 999999 })], [track], TODAY),
    ).toBe(0)
  })
})

describe('accounts with hostile data', () => {
  const acc = (o: Partial<Account>): Account => ({
    id: 'a1',
    name: 'A',
    kind: 'bank',
    openingBalanceMinor: 0,
    openingOn: '2026-09-01',
    archived: false,
    ...o,
  })

  it('summarises an empty set to zeroes, not NaN', () => {
    const s = summariseAccounts([], [])
    expect(s.totalCashMinor).toBe(0)
    expect(s.totalOwedMinor).toBe(0)
    expect(s.netWorthMinor).toBe(0)
  })

  it('does not throw on rows with a blank date', () => {
    const rows = [
      {
        id: 'x',
        occurredOn: '',
        amountMinor: 1000,
        movement: 'expense',
        trackId: 't',
        categoryName: 'c',
        description: '',
        paymentMethod: 'upi',
        source: 'manual',
        createdAt: 0,
        accountId: 'a1',
      } as Transaction,
    ]
    expect(() => accountBalance(acc({}), rows)).not.toThrow()
    expect(accountBalance(acc({ openingBalanceMinor: 5000 }), rows).balanceMinor).toBe(5000)
  })
})
