/*
The trust boundary between Firestore and the rest of the app.

Every hook used to do `{ id: d.id, ...d.data() } as Transaction` - a cast, which
is a promise to the compiler that nothing checks. Firestore is schemaless, so
that promise is only as good as every write that ever ran: an older build, a
half-applied voice plan, a hand-edit in the console, or a field that simply
never existed yet.

The cost of being wrong is not a type error, it is arithmetic. `undefined`
amountMinor makes one row's total NaN, NaN propagates through every sum it
touches, and the hero figure renders "₹NaN". A missing occurredOn is worse:
isInMonth() called .split() on it and threw, which unmounts the whole tree.

So nothing enters the app un-checked. Each row is coerced to a well-formed
shape, and a row too broken to repair is dropped rather than propagated - one
lost row is a far smaller lie than a poisoned total, and it is logged so it can
be found.
*/

import { MAX_AMOUNT_MINOR } from './money'
import type {
  Account,
  AccountKind,
  Category,
  Movement,
  PaymentMethod,
  Source,
  Track,
  TrackType,
  Transaction,
} from './types'

type Raw = Record<string, unknown>

const MOVEMENTS: Movement[] = ['expense', 'income', 'transfer', 'refund']
const METHODS: PaymentMethod[] = ['upi', 'cash', 'card', 'bank_transfer']
const SOURCES: Source[] = ['manual', 'chat', 'voice', 'receipt', 'email', 'seed']
const TRACK_TYPES: TrackType[] = ['spending', 'commitment', 'goal', 'project']
const ACCOUNT_KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'credit_card']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Dev-only: a dropped row is a data bug worth seeing, not worth a user-facing error. */
function warn(what: string, why: string, row: unknown) {
  if (import.meta.env.DEV) console.warn(`[sanitize] dropped ${what}: ${why}`, row)
}

/**
 * A finite integer, or the fallback.
 *
 * Rejects NaN, Infinity and non-numbers, and clamps magnitude so no single row
 * can push a running total past Number.MAX_SAFE_INTEGER and start losing
 * precision silently.
 */
export function safeInt(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(-MAX_AMOUNT_MINOR, Math.min(MAX_AMOUNT_MINOR, Math.round(n)))
}

/** A non-negative finite integer. Amounts carry magnitude only; `movement` carries sign. */
function safeAmount(value: unknown): number {
  return Math.abs(safeInt(value, 0))
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value)
    ? (value as T)
    : fallback
}

function optionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = safeInt(value, Number.NaN)
  return Number.isFinite(n) ? n : undefined
}

/** A day-of-month that a calendar could actually contain. */
function safeDay(value: unknown): number | undefined {
  const n = optionalInt(value)
  if (n === undefined || n < 1 || n > 31) return undefined
  return n
}

/**
 * An ISO date the rest of the app can rely on.
 *
 * Accepts 'YYYY-MM-DD' and the leading date of a timestamp, because both have
 * been written by different code paths. Anything else is not repairable into a
 * real day, and guessing one would silently file money on the wrong date.
 */
export function safeDate(value: unknown): string | undefined {
  /*
  Widened deliberately.

  This runs against data already in the database, written by every version of
  this app that has ever existed. Being strict here does not protect anything -
  the output is canonicalised either way - it just silently deletes a real
  expense from the user's view. So anything that unambiguously denotes a day is
  accepted and normalised: a Date, a Firestore Timestamp, and an unpadded
  'YYYY-M-D' as well as the canonical form.
  */
  let text: string

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    text = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate(),
    ).padStart(2, '0')}`
  } else if (
    // A Firestore Timestamp, without importing the SDK into a pure module.
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return safeDate((value as { toDate: () => Date }).toDate())
  } else if (typeof value === 'string') {
    text = value
  } else {
    return undefined
  }

  // Pad 'YYYY-M-D' into canonical form before matching.
  const parts = text.slice(0, 10).split('-')
  const head =
    parts.length === 3
      ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].slice(0, 2).padStart(2, '0')}`
      : text.slice(0, 10)

  if (!ISO_DATE.test(head)) return undefined

  // Reject dates the regex allows but the calendar does not - '2026-13-45'.
  const [y, m, d] = head.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return undefined
  }

  return head
}

/**
 * A transaction, or null if it cannot be trusted.
 *
 * Dropped only for the two fields with no safe default: an amount that is not a
 * number, and a date that is not a real day. Every other field degrades to a
 * sensible value, because losing a row's note is nothing and losing the row is
 * something.
 */
export function toTransaction(id: string, raw: Raw): Transaction | null {
  const occurredOn = safeDate(raw.occurredOn)
  if (!occurredOn) {
    warn('transaction', 'occurredOn is not a real date', { id, occurredOn: raw.occurredOn })
    return null
  }

  /*
  NaN is a number.

  Checking `typeof raw.amountMinor !== 'number'` let NaN straight through, where
  safeAmount() quietly turned it into 0 - so a corrupt row became a free row
  rather than a dropped one, and the ledger silently lost the amount instead of
  reporting a problem. null is the mirror image: Number(null) is 0, not NaN, so
  it has to be excluded by identity rather than by arithmetic.
  */
  const rawAmount = raw.amountMinor
  const numeric =
    rawAmount === null || rawAmount === undefined || rawAmount === ''
      ? Number.NaN
      : Number(rawAmount)

  if (!Number.isFinite(numeric)) {
    warn('transaction', 'amountMinor is not a usable number', { id, amountMinor: rawAmount })
    return null
  }

  const amountMinor = safeAmount(numeric)

  const deletedAt = typeof raw.deletedAt === 'number' ? raw.deletedAt : null

  return {
    id,
    occurredOn,
    amountMinor,
    movement: oneOf(raw.movement, MOVEMENTS, 'expense'),
    trackId: safeString(raw.trackId),
    categoryName: safeString(raw.categoryName, 'Other'),
    description: safeString(raw.description),
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
    paymentMethod: oneOf(raw.paymentMethod, METHODS, 'upi'),
    source: oneOf(raw.source, SOURCES, 'manual'),
    ...(typeof raw.fromTrackId === 'string' ? { fromTrackId: raw.fromTrackId } : {}),
    ...(typeof raw.toTrackId === 'string' ? { toTrackId: raw.toTrackId } : {}),
    ...(typeof raw.accountId === 'string' ? { accountId: raw.accountId } : {}),
    ...(typeof raw.toAccountId === 'string' ? { toAccountId: raw.toAccountId } : {}),
    createdAt: safeInt(raw.createdAt, 0),
    deletedAt,
  }
}

/** A track. Only a missing name is fatal - everything else has a defensible default. */
export function toTrack(id: string, raw: Raw): Track | null {
  const name = safeString(raw.name).trim()
  if (!name) {
    warn('track', 'no name', { id })
    return null
  }

  return {
    id,
    name,
    type: oneOf(raw.type, TRACK_TYPES, 'spending'),
    archived: raw.archived === true,
    monthlyLimitMinor: optionalInt(raw.monthlyLimitMinor),
    commitmentAmountMinor: optionalInt(raw.commitmentAmountMinor),
    dueDay: safeDay(raw.dueDay),
    openingBalanceMinor: optionalInt(raw.openingBalanceMinor),
    ...(typeof raw.openingInAccounts === 'boolean'
      ? { openingInAccounts: raw.openingInAccounts }
      : {}),
    targetMinor: optionalInt(raw.targetMinor),
    plannedMonthlyMinor: optionalInt(raw.plannedMonthlyMinor),
    targetDate: safeDate(raw.targetDate),
    ...(typeof raw.raidable === 'boolean' ? { raidable: raw.raidable } : {}),
    priority: optionalInt(raw.priority),
    startDate: safeDate(raw.startDate),
    endDate: safeDate(raw.endDate),
    budgetMinor: optionalInt(raw.budgetMinor),
    ...(raw.phase === 'accumulating' || raw.phase === 'active' || raw.phase === 'closed'
      ? { phase: raw.phase }
      : {}),
    createdAt: optionalInt(raw.createdAt),
  }
}

/**
 * An account.
 *
 * openingOn defaults to the epoch rather than today when missing: the balance
 * filter is `occurredOn >= openingOn`, so an undefined date silently excluded
 * every row and reported a balance of exactly the opening figure, for ever.
 * The epoch includes everything, which is the safer direction to be wrong in -
 * visibly odd rather than invisibly stuck.
 */
export function toAccount(id: string, raw: Raw): Account | null {
  const name = safeString(raw.name).trim()
  if (!name) {
    warn('account', 'no name', { id })
    return null
  }

  return {
    id,
    name,
    kind: oneOf(raw.kind, ACCOUNT_KINDS, 'bank'),
    openingBalanceMinor: safeInt(raw.openingBalanceMinor, 0),
    openingOn: safeDate(raw.openingOn) ?? '1970-01-01',
    creditLimitMinor: optionalInt(raw.creditLimitMinor),
    statementDay: safeDay(raw.statementDay),
    dueDay: safeDay(raw.dueDay),
    ...(typeof raw.isPrimary === 'boolean' ? { isPrimary: raw.isPrimary } : {}),
    archived: raw.archived === true,
    createdAt: optionalInt(raw.createdAt),
  }
}

export function toCategory(id: string, raw: Raw): Category | null {
  const name = safeString(raw.name).trim()
  if (!name) {
    warn('category', 'no name', { id })
    return null
  }

  return {
    id,
    name,
    slug: safeString(raw.slug, name.toLowerCase()),
    ...(Array.isArray(raw.aliases)
      ? { aliases: raw.aliases.filter((a): a is string => typeof a === 'string') }
      : {}),
    archived: raw.archived === true,
    createdFrom: oneOf(raw.createdFrom, ['seed', 'manual', 'voice'] as const, 'manual'),
    createdAt: optionalInt(raw.createdAt),
  }
}

/**
 * Map a Firestore snapshot through a sanitiser, discarding what cannot be
 * repaired. Generic so each hook reads as one line.
 */
export function sanitiseAll<T>(
  docs: Array<{ id: string; data: () => Raw }>,
  fn: (id: string, raw: Raw) => T | null,
): T[] {
  const out: T[] = []
  for (const d of docs) {
    const row = fn(d.id, d.data())
    if (row) out.push(row)
  }
  return out
}
