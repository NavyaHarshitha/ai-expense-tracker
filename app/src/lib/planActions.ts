/*
Validating and describing the planner's output.

The model's output is UNTRUSTED input that is about to be applied to a financial
ledger, so every action is validated and normalised here before anything reaches
Firestore. An unknown tool, a negative amount, a due day of 47 - all rejected
rather than written and dealt with later.

Summaries are generated here rather than asked of the model, so what the user
reads before tapping Apply is guaranteed to match what will actually be written.
*/

import { formatINR, toPaise } from './money'
import { TRACK_TYPE_LABELS, type Movement, type PaymentMethod, type Track, type TrackType } from './types'

export interface RawAction {
  tool: string
  args: Record<string, unknown>
}

export type NormalisedAction =
  | {
      kind: 'create_track'
      name: string
      type: TrackType
      amountMinor?: number
      dueDay?: number
      perMonthMinor?: number
      locked?: boolean
    }
  | {
      kind: 'update_track'
      trackId: string
      trackName: string
      newName?: string
      amountMinor?: number
      dueDay?: number
      perMonthMinor?: number
      locked?: boolean
    }
  | {
      kind: 'set_income'
      amountMinor: number
    }
  | {
      kind: 'create_expense'
      amountMinor: number
      description: string
      category: string
      paymentMethod: PaymentMethod
      movement: Movement
      trackName?: string
      occurredOn?: string
      note?: string
    }

const TRACK_TYPES: TrackType[] = ['spending', 'commitment', 'goal', 'project']
const METHODS: PaymentMethod[] = ['upi', 'cash', 'card', 'bank_transfer']
const MOVEMENTS: Movement[] = ['expense', 'income', 'transfer', 'refund']

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Rupees -> paise, but only for a finite non-negative number. */
function minor(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return toPaise(n)
}

function day(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 31) return undefined
  return n
}

/**
 * A real ISO date within a sane window of the client's today.
 *
 * Backdating is legitimate ("spent 500 last Monday"), so the window is generous
 * rather than a-day-either-side. But a date the model got badly wrong - a
 * mis-resolved "yesterday", or a year typo - must not silently land somewhere
 * that no month's figures include.
 */
function validDate(value: unknown, today: Date): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [y, m, d] = value.split('-').map(Number)
  const parsed = new Date(y, m - 1, d)

  // Rejects 2026-02-31 and friends, which Date happily rolls over.
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    return false
  }

  const days = (parsed.getTime() - today.getTime()) / 86_400_000
  return days <= 1 && days >= -120
}

/**
 * Turn one raw action into something safe to write, or null to drop it.
 *
 * `existing` is needed so update_track can be resolved to a real id - the model
 * only knows track names.
 */
export function normalise(
  raw: RawAction,
  existing: Track[],
  today: Date,
): NormalisedAction | null {
  const a = raw.args ?? {}

  switch (raw.tool) {
    case 'create_track': {
      const name = str(a.name)
      const type = str(a.type) as TrackType
      if (!name || !TRACK_TYPES.includes(type)) return null

      return {
        kind: 'create_track',
        name,
        type,
        amountMinor: minor(a.amount_rupees),
        dueDay: type === 'commitment' ? day(a.due_day) : undefined,
        perMonthMinor:
          type === 'goal' || type === 'project' ? minor(a.per_month_rupees) : undefined,
        locked: type === 'goal' && a.locked === true ? true : undefined,
      }
    }

    case 'update_track': {
      const wanted = str(a.track_name).toLowerCase()
      const match = existing.find((t) => t.name.toLowerCase() === wanted)
      // No silent creation on a failed match - a typo must not spawn a duplicate track.
      if (!match) return null

      return {
        kind: 'update_track',
        trackId: match.id,
        trackName: match.name,
        newName: str(a.new_name) || undefined,
        amountMinor: minor(a.amount_rupees),
        dueDay: day(a.due_day),
        perMonthMinor: minor(a.per_month_rupees),
        locked: typeof a.locked === 'boolean' ? a.locked : undefined,
      }
    }

    case 'set_monthly_income': {
      const amountMinor = minor(a.rupees)
      if (!amountMinor || amountMinor <= 0) return null
      return { kind: 'set_income', amountMinor }
    }

    case 'create_expense': {
      const amountMinor = minor(a.amount_rupees)
      if (!amountMinor || amountMinor <= 0) return null

      const method = str(a.payment_method) as PaymentMethod
      const movement = str(a.movement) as Movement

      return {
        kind: 'create_expense',
        amountMinor,
        description: str(a.description) || str(a.category) || 'Expense',
        category: str(a.category) || 'Other',
        paymentMethod: METHODS.includes(method) ? method : 'upi',
        movement: MOVEMENTS.includes(movement) ? movement : 'expense',
        trackName: str(a.track_name) || undefined,
        occurredOn: validDate(a.occurred_on, today) ? (a.occurred_on as string) : undefined,
        note: str(a.note) || undefined,
      }
    }

    default:
      return null
  }
}

export function normaliseAll(
  raw: RawAction[],
  existing: Track[],
  today: Date,
): NormalisedAction[] {
  return raw
    .map((r) => normalise(r, existing, today))
    .filter((a): a is NormalisedAction => a !== null)
}

/** True for anything that changes the structure of the budget rather than recording money. */
export function isStructural(action: NormalisedAction): boolean {
  return action.kind !== 'create_expense'
}

/** Plain-English description of exactly what will be written. */
export function describe(action: NormalisedAction): string {
  switch (action.kind) {
    case 'create_track': {
      const bits: string[] = [`Create ${TRACK_TYPE_LABELS[action.type].toLowerCase()} track “${action.name}”`]

      if (action.amountMinor) {
        const label =
          action.type === 'spending'
            ? 'monthly limit'
            : action.type === 'commitment'
              ? 'due'
              : action.type === 'goal'
                ? 'holding'
                : 'budget'
        bits.push(`${label} ${formatINR(action.amountMinor)}`)
      }
      if (action.dueDay) bits.push(`on the ${ordinal(action.dueDay)}`)
      if (action.perMonthMinor) bits.push(`${formatINR(action.perMonthMinor)}/month`)
      if (action.locked) bits.push('locked from spending advice')

      return bits.join(' · ')
    }

    case 'update_track': {
      const bits: string[] = [`Update “${action.trackName}”`]
      if (action.newName) bits.push(`rename to “${action.newName}”`)
      if (action.amountMinor !== undefined) bits.push(`amount ${formatINR(action.amountMinor)}`)
      if (action.dueDay) bits.push(`due on the ${ordinal(action.dueDay)}`)
      if (action.perMonthMinor !== undefined) bits.push(`${formatINR(action.perMonthMinor)}/month`)
      if (action.locked !== undefined) bits.push(action.locked ? 'lock it' : 'unlock it')
      return bits.join(' · ')
    }

    case 'set_income':
      return `Set monthly income to ${formatINR(action.amountMinor)}`

    case 'create_expense':
      return `Record ${formatINR(action.amountMinor)} · ${action.description} · ${action.category}${
        action.trackName ? ` · ${action.trackName}` : ''
      }`
  }
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}
