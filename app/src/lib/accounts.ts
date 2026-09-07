/*
Accounts - where the money physically sits.

A track answers "which bucket does this come out of"; an account answers "which
account did it actually move through". They are different questions and both
matter: rent might be reserved in a commitment track, but it debits HDFC on the
5th, and only the account knows whether HDFC will cover it.

A single combined balance cannot answer that. If rent leaves one account on the
5th and an EMI leaves another on the 28th, the total tells you nothing about
whether either will bounce.
*/

import type { Account, Transaction } from './types'

export interface AccountBalance {
  account: Account
  /**
   * For bank, cash and wallet: what the account holds.
   * For a credit card: what is OWED - spending raises it, paying lowers it.
   */
  balanceMinor: number
  inMinor: number
  outMinor: number
  countedRows: number
}

function sinceOpening(occurredOn: string, openingOn: string): boolean {
  // ISO YYYY-MM-DD strings compare correctly as strings.
  return Boolean(occurredOn) && occurredOn >= openingOn
}

/**
 * Rows that moved money through this account, including the receiving side of a
 * transfer.
 */
function rowsFor(account: Account, transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (t) =>
      !t.deletedAt &&
      (t.accountId === account.id || t.toAccountId === account.id) &&
      sinceOpening(t.occurredOn, account.openingOn),
  )
}

/*
A credit card is not just another account.

Its balance is a debt, so the signs invert: spending on the card increases what
you owe, and a payment reduces it. Nothing on a card touches your cash until the
bill is paid - which is exactly why treating it as a bank account would overstate
your money all month and then double-count the payment.
*/
function creditCardBalance(account: Account, rows: Transaction[]): AccountBalance {
  let owed = account.openingBalanceMinor
  let inMinor = 0
  let outMinor = 0
  let countedRows = 0

  for (const t of rows) {
    const isSource = t.accountId === account.id
    const isDestination = t.toAccountId === account.id

    /*
    A bill payment arrives as a transfer INTO the card, so the card is the
    DESTINATION, not the source - the source is whichever bank paid it. Checking
    only accountId here meant payments never reduced the debt, which the test
    caught: a card spent to Rs 7,000 and paid Rs 5,000 still read Rs 7,000.
    */
    if (t.movement === 'transfer') {
      if (isDestination) {
        owed -= t.amountMinor
        inMinor += t.amountMinor
        countedRows++
      }
      continue
    }

    if (!isSource) continue

    if (t.movement === 'expense') {
      owed += t.amountMinor
      outMinor += t.amountMinor
      countedRows++
    } else if (t.movement === 'refund') {
      owed -= t.amountMinor
      inMinor += t.amountMinor
      countedRows++
    }
  }

  return { account, balanceMinor: owed, inMinor, outMinor, countedRows }
}

export function accountBalance(account: Account, transactions: Transaction[]): AccountBalance {
  const rows = rowsFor(account, transactions)

  if (account.kind === 'credit_card') return creditCardBalance(account, rows)

  let balanceMinor = account.openingBalanceMinor
  let inMinor = 0
  let outMinor = 0
  let countedRows = 0

  for (const t of rows) {
    const isSource = t.accountId === account.id
    const isDestination = t.toAccountId === account.id

    switch (t.movement) {
      case 'income':
      case 'refund':
        if (isSource) {
          balanceMinor += t.amountMinor
          inMinor += t.amountMinor
          countedRows++
        }
        break

      case 'expense':
        if (isSource) {
          balanceMinor -= t.amountMinor
          outMinor += t.amountMinor
          countedRows++
        }
        break

      case 'transfer':
        /*
        Both sides counted, so a transfer nets to zero across the accounts while
        moving both balances. Destination first: a transfer with no toAccountId
        is money leaving for somewhere untracked (a savings pot, a card bill),
        which still has to reduce the source.
        */
        if (isDestination) {
          balanceMinor += t.amountMinor
          inMinor += t.amountMinor
          countedRows++
        } else if (isSource) {
          balanceMinor -= t.amountMinor
          outMinor += t.amountMinor
          countedRows++
        }
        break
    }
  }

  return { account, balanceMinor, inMinor, outMinor, countedRows }
}

export interface AccountsSummary {
  balances: AccountBalance[]
  /** Cash-like accounts only - what you actually have. */
  totalCashMinor: number
  /** Total owed across credit cards. */
  totalOwedMinor: number
  /** Cash less card debt: the honest net position. */
  netWorthMinor: number
}

export function summariseAccounts(
  accounts: Account[],
  transactions: Transaction[],
): AccountsSummary {
  const balances = accounts
    .filter((a) => !a.archived)
    .map((a) => accountBalance(a, transactions))

  let totalCashMinor = 0
  let totalOwedMinor = 0

  for (const b of balances) {
    if (b.account.kind === 'credit_card') totalOwedMinor += b.balanceMinor
    else totalCashMinor += b.balanceMinor
  }

  return {
    balances,
    totalCashMinor,
    totalOwedMinor,
    // Cards are a liability, so they subtract - a total that ignored them would
    // flatter you by exactly the amount you owe.
    netWorthMinor: totalCashMinor - totalOwedMinor,
  }
}

/** Which account should a new expense default to? The primary, else the first. */
export function defaultAccountId(accounts: Account[]): string | undefined {
  const live = accounts.filter((a) => !a.archived && a.kind !== 'credit_card')
  return (live.find((a) => a.isPrimary) ?? live[0] ?? accounts[0])?.id
}

export const ACCOUNT_KIND_LABELS: Record<Account['kind'], string> = {
  bank: 'Bank account',
  cash: 'Cash',
  wallet: 'Wallet / UPI',
  credit_card: 'Credit card',
}
