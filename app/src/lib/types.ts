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

  createdAt: number
  /** soft delete - all reads filter on this being null */
  deletedAt?: number | null
}

export interface Profile {
  monthlyIncomeMinor: number
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
