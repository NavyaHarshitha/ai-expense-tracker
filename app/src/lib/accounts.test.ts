import { describe, expect, it } from 'vitest'

import { accountBalance, defaultAccountId, summariseAccounts } from './accounts'
import { toPaise } from './money'
import type { Account, Transaction } from './types'

const hdfc: Account = {
  id: 'hdfc', name: 'HDFC Savings', kind: 'bank',
  openingBalanceMinor: toPaise(50000), openingOn: '2026-09-01',
  isPrimary: true, archived: false,
}

const sbi: Account = {
  id: 'sbi', name: 'SBI Salary', kind: 'bank',
  openingBalanceMinor: toPaise(20000), openingOn: '2026-09-01', archived: false,
}

const card: Account = {
  id: 'card', name: 'HDFC Credit Card', kind: 'credit_card',
  openingBalanceMinor: toPaise(4000), openingOn: '2026-09-01',
  creditLimitMinor: toPaise(200000), dueDay: 18, archived: false,
}

const t = (over: Partial<Transaction>): Transaction => ({
  id: 'x', occurredOn: '2026-09-04', amountMinor: toPaise(1000),
  movement: 'expense', trackId: 'daily', categoryName: 'Food',
  description: 'x', paymentMethod: 'upi', source: 'manual',
  accountId: 'hdfc', createdAt: 0, deletedAt: null, ...over,
})

describe('accountBalance - bank', () => {
  it('starts from the opening balance', () => {
    expect(accountBalance(hdfc, []).balanceMinor).toBe(toPaise(50000))
  })

  it('subtracts expenses and adds income on that account only', () => {
    const rows = [
      t({ id: 'a', amountMinor: toPaise(1200) }),
      t({ id: 'b', amountMinor: toPaise(80000), movement: 'income' }),
      t({ id: 'other', amountMinor: toPaise(9999), accountId: 'sbi' }),
    ]
    expect(accountBalance(hdfc, rows).balanceMinor).toBe(toPaise(50000 - 1200 + 80000))
    expect(accountBalance(sbi, rows).balanceMinor).toBe(toPaise(20000 - 9999))
  })

  it('ignores rows dated before the account was opened', () => {
    expect(accountBalance(hdfc, [t({ occurredOn: '2026-08-30' })]).balanceMinor).toBe(toPaise(50000))
  })

  it('ignores soft-deleted and undated rows', () => {
    const rows = [t({ id: 'g', deletedAt: 1 }), t({ id: 'u', occurredOn: '' })]
    expect(accountBalance(hdfc, rows).balanceMinor).toBe(toPaise(50000))
  })

  it('can go negative - an overdrawn account is a real state', () => {
    expect(accountBalance(sbi, [t({ accountId: 'sbi', amountMinor: toPaise(90000) })]).balanceMinor)
      .toBeLessThan(0)
  })
})

describe('transfers between accounts', () => {
  const move = [
    t({ id: 'mv', movement: 'transfer', amountMinor: toPaise(10000), accountId: 'hdfc', toAccountId: 'sbi' }),
  ]

  it('moves both balances', () => {
    expect(accountBalance(hdfc, move).balanceMinor).toBe(toPaise(40000))
    expect(accountBalance(sbi, move).balanceMinor).toBe(toPaise(30000))
  })

  it('nets to zero across the accounts - no money is created or destroyed', () => {
    const before = hdfc.openingBalanceMinor + sbi.openingBalanceMinor
    const s = summariseAccounts([hdfc, sbi], move)
    expect(s.totalCashMinor).toBe(before)
  })

  it('still reduces the source when the destination is untracked', () => {
    // Money leaving for somewhere the app does not model - a savings pot
    // elsewhere. It must not silently stay in the account.
    const out = [t({ movement: 'transfer', amountMinor: toPaise(5000), toAccountId: undefined })]
    expect(accountBalance(hdfc, out).balanceMinor).toBe(toPaise(45000))
  })
})

describe('credit cards invert', () => {
  it('treats the balance as what is OWED, so spending raises it', () => {
    const rows = [t({ accountId: 'card', amountMinor: toPaise(3000) })]
    expect(accountBalance(card, rows).balanceMinor).toBe(toPaise(7000))
  })

  it('reduces the debt when the bill is paid', () => {
    const rows = [
      t({ id: 'spend', accountId: 'card', amountMinor: toPaise(3000) }),
      t({ id: 'pay', movement: 'transfer', amountMinor: toPaise(5000), accountId: 'hdfc', toAccountId: 'card' }),
    ]
    expect(accountBalance(card, rows).balanceMinor).toBe(toPaise(2000))
  })

  it('does not touch cash when spent - only when the bill is paid', () => {
    // The whole reason a card cannot be modelled as a bank account: card
    // spending must not reduce your money until you actually pay.
    const spend = [t({ accountId: 'card', amountMinor: toPaise(3000) })]
    expect(accountBalance(hdfc, spend).balanceMinor).toBe(toPaise(50000))
  })

  it('subtracts card debt from the net position rather than ignoring it', () => {
    const s = summariseAccounts([hdfc, card], [t({ accountId: 'card', amountMinor: toPaise(3000) })])
    expect(s.totalCashMinor).toBe(toPaise(50000))
    expect(s.totalOwedMinor).toBe(toPaise(7000))
    expect(s.netWorthMinor).toBe(toPaise(43000))
  })
})

describe('summariseAccounts', () => {
  it('excludes archived accounts', () => {
    const s = summariseAccounts([hdfc, { ...sbi, archived: true }], [])
    expect(s.balances).toHaveLength(1)
    expect(s.totalCashMinor).toBe(toPaise(50000))
  })

  it('handles no accounts at all', () => {
    const s = summariseAccounts([], [])
    expect(s.netWorthMinor).toBe(0)
  })
})

describe('defaultAccountId', () => {
  it('prefers the primary', () => {
    expect(defaultAccountId([sbi, hdfc])).toBe('hdfc')
  })

  it('never defaults to a credit card', () => {
    // Defaulting expenses onto a card would quietly build debt nobody chose.
    expect(defaultAccountId([card, sbi])).toBe('sbi')
  })

  it('falls back to the first when none is primary', () => {
    expect(defaultAccountId([sbi])).toBe('sbi')
  })

  it('is undefined when there are no accounts', () => {
    expect(defaultAccountId([])).toBeUndefined()
  })
})
