/*
The domain model.

Two ideas carry most of the weight here:

1. Category and track are different axes. Category is WHAT was bought
   (descriptive, for analysis). Track is WHICH BUCKET it came out of
   (intentional, for budgeting). Dinner on a trip is category Food,
   track "Goa Trip" - so it never pollutes the monthly food budget.

2. Every entry has a movement type, and only one of them is spending.
   Logging a savings contribution as an expense would make money you
   still hold look spent.
*/

export type TrackType = 'spending' | 'commitment' | 'goal' | 'project'

export type Movement = 'expense' | 'income' | 'transfer' | 'refund'

export type PaymentMethod = 'upi' | 'cash' | 'card' | 'bank_transfer'

export type Source = 'manual' | 'chat' | 'voice' | 'receipt' | 'email' | 'seed'

export type ProjectPhase = 'accumulating' | 'active' | 'closed'

export interface Track {
  id: string
  name: string
  type: TrackType
  archived: boolean

  /** spending: resets every month, warns on burn rate */
  monthlyLimitMinor?: number

  /** commitment: known amount on a known day, reserved up front */
  commitmentAmountMinor?: number
  dueDay?: number

  /**
   * Money already in this track before tracking began.
   *
   * Without it there is nowhere to record what you already hold: an existing
   * Rs 60,000 of mutual funds would have to be faked as a transfer that never
   * happened, stating a fact about the past by polluting the ledger.
   */
  openingBalanceMinor?: number

  /**
   * Is that opening balance sitting in one of the user's tracked accounts?
   *
   * The same figure means two different things depending on where the money
   * physically is, and only the user knows which:
   *
   * - FALSE (default) - held elsewhere: a mutual fund, a bank not added here.
   *   It counts toward the goal's target but is not part of any account
   *   balance, so it must not be subtracted from spendable cash.
   *
   * - TRUE - sitting in a tracked account, earmarked. The account balance
   *   still shows it, because the bank still shows it, but it is spoken for
   *   and Safe-to-Spend must not offer it.
   *
   * Without this distinction there is no way to say "this money is in my
   * account, but it is not mine to spend" - the one thing an envelope budget
   * exists to express.
   */
  openingInAccounts?: boolean

  /** goal: target to accumulate toward */
  targetMinor?: number
  plannedMonthlyMinor?: number
  targetDate?: string
  /** false locks this goal out of spending advice - e.g. an emergency fund */
  raidable?: boolean
  priority?: number

  /** project: date-bounded, accumulates then spends down then closes */
  startDate?: string
  endDate?: string
  budgetMinor?: number
  phase?: ProjectPhase

  createdAt?: number
}

export interface Transaction {
  id: string
  /** YYYY-MM-DD - when the money moved, not when it was recorded */
  occurredOn: string
  /** always positive; direction comes from `movement` */
  amountMinor: number
  movement: Movement
  trackId: string
  categoryName: string
  description: string
  /** optional, never required - this is where the *why* lives */
  note?: string
  paymentMethod: PaymentMethod
  source: Source

  /** transfers only */
  fromTrackId?: string
  toTrackId?: string

  /**
   * Which account the money moved through.
   *
   * Optional because rows written before accounts existed have none; every
   * balance treats a missing accountId as "not on any account" rather than
   * guessing, so an old row never silently distorts a figure.
   */
  accountId?: string
  /** The receiving account, for a transfer between two of your own accounts. */
  toAccountId?: string

  createdAt: number
  /** soft delete - all reads filter on this being null */
  deletedAt?: number | null
}

export type AccountKind = 'bank' | 'cash' | 'wallet' | 'credit_card'

/*
Where money physically sits, as opposed to which bucket it is earmarked for.

A track and an account answer different questions - "which budget does this come
out of" versus "which account did it actually leave". Rent can be reserved in a
commitment track and still bounce because it debits the wrong account on the 5th.
*/
export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** What it held when tracking began, and the date that was true. */
  openingBalanceMinor: number
  /** YYYY-MM-DD */
  openingOn: string

  /** Credit cards only. */
  creditLimitMinor?: number
  statementDay?: number
  dueDay?: number

  /** Where new expenses land unless another is chosen. */
  isPrimary?: boolean
  archived: boolean
  createdAt?: number
}

export interface Category {
  id: string
  name: string
  /** Normalised name, used to detect duplicates before they are created. */
  slug: string
  /** Other spellings that should resolve here, so voice does not create twins. */
  aliases?: string[]
  archived: boolean
  createdFrom: 'seed' | 'manual' | 'voice'
  createdAt?: number
}

export interface Profile {
  monthlyIncomeMinor: number

  /*
  Bank balance is stored as an ANCHOR plus a date, not as a running total.

  The app cannot see the bank. If it kept a single balance figure and adjusted
  it, one missed expense would leave it permanently wrong with no way back
  except arithmetic. An anchor lets you say "my actual balance today is X" and
  re-base from there - which is reconciliation, and it is the honest primitive.
  */
  balanceAnchorMinor?: number
  /** YYYY-MM-DD - the date the anchor figure was true. */
  balanceAnchorOn?: string

  /**
   * Day of the month the salary lands.
   *
   * This is what lets the app understand a financial month that does not start
   * on the 1st. A commitment falling due BEFORE payday cannot be funded by that
   * month's salary - it has to come out of the previous month's money - so it
   * must be held back a cycle early rather than reserved in the month it is
   * dated.
   */
  paydayDay?: number

  /** Set once, when the single balance anchor is migrated into an account. */
  accountsMigratedAt?: number

  /*
  Set once, when the starter categories are created.

  Without it, deliberately deleting every category would look identical to a
  brand-new account and the defaults would silently reappear.
  */
  categoriesSeededAt?: number
}

export const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  spending: 'Spending',
  commitment: 'Commitment',
  goal: 'Goal',
  project: 'Project',
}

export const MOVEMENT_LABELS: Record<Movement, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
}
