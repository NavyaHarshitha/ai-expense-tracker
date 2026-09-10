/*
Client for the Cloud Run service.

Every call carries a Firebase ID token. getIdToken() returns a cached token and
refreshes it automatically when it is close to expiry, so this is cheap to call
per request and we never hold a stale one.
*/

import { auth } from './firebase'
import { todayKey } from '../hooks/useToday'
import type { PaymentMethod } from './types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** What /parse returns. Snake_case because it is the wire format, not our domain model. */
export interface ParsedCandidate {
  amount_rupees: number
  description: string
  category: string
  payment_method: PaymentMethod
  occurred_on?: string
  note?: string
  confidence: number
}

export interface MonthlyInsight {
  headline: string
  body: string
  actions: string[]
  model: string
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/*
Model calls take seconds, not milliseconds - a narrative is around 13 - so the
ceiling has to be generous. But fetch() has no timeout of its own: a dropped
connection or a stalled request leaves the promise pending for ever, and any
caller awaiting it is stuck with no error and no way back. That is exactly how
the Dashboard ended up reading "Writing…" indefinitely.
*/
const REQUEST_TIMEOUT_MS = 45_000

async function post<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new ApiError('Not signed in', 401)

  const token = await user.getIdToken()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    // An abort and a genuine network failure both land here.
    throw new ApiError(
      controller.signal.aborted
        ? 'That took too long. Check your connection and try again.'
        : 'Could not reach the server. Check your connection.',
      0,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    // Map the statuses the UI actually needs to say something different about.
    const message =
      response.status === 413
        ? 'That recording was too long. Keep it under a minute.'
        : response.status === 429
          ? 'Slow down a moment - too many requests in a row.'
          : response.status === 400
            ? 'That input could not be read. Try again.'
            : response.status === 502
              ? 'Could not reach the model. Try again in a moment.'
              : response.status === 401
                ? 'Your session expired. Sign in again.'
                : 'Something went wrong. Try again.'
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<T>
}

export async function fetchInsight(figures: {
  month: string
  income_rupees: number
  committed_rupees: number
  planned_savings_rupees: number
  spent_rupees: number
  safe_to_spend_rupees: number
  days_remaining: number
  top_categories: Array<{ name: string; rupees: number; share: number }>
  previous_month_spent_rupees?: number
}): Promise<MonthlyInsight> {
  return post<MonthlyInsight>('/insights', figures)
}

// ---------------------------------------------------------------------------
// Action planning
// ---------------------------------------------------------------------------

export interface RawPlannedAction {
  tool: string
  args: Record<string, unknown>
}

export interface PlanResult {
  actions: RawPlannedAction[]
  reply: string
  model: string
  /** What the model heard, verbatim. */
  transcript: string
}

/**
 * Turn an instruction into intended actions.
 *
 * Only track names and types are sent - the planner never needs amounts or the
 * ledger, which keeps the prompt small and cheap however large the ledger gets.
 */
export async function planActions(input: {
  text?: string
  audioBase64?: string
  /** A photographed receipt, already downscaled by the client. */
  imageBase64?: string
  mimeType?: string
  /*
  Names alone were not enough.

  "The SBI SIP was paid" is unanswerable without knowing what that SIP is worth,
  and the planner is instructed never to invent an amount - so it correctly did
  nothing, and the user saw "didn't catch anything to do there" after being
  transcribed perfectly. The stored amount is not an invention, so it is sent.
  */
  existingTracks: Array<{
    name: string
    type: string
    /** The track's defining amount, in rupees. */
    amountRupees?: number
    /** Commitments only: the day of the month it falls due. */
    dueDay?: number
  }>
  categories: string[]
  /** Enough to identify a row the user refers to - never the whole ledger. */
  recentTransactions?: Array<{
    id: string
    date: string
    description: string
    amount: number
    category: string
  }>
}): Promise<PlanResult> {
  /*
  `today` is the CLIENT's local date, and it matters.

  Cloud Run runs in UTC, so a server-side date.today() reads as yesterday for
  the whole 00:00-05:29 IST window. Saying "spent 600 on dinner" at 1am would
  stamp yesterday's date, and "yesterday" would resolve two days back. At a month
  boundary the expense lands in the wrong month and disappears from the current
  month's figures entirely.
  */
  return post<PlanResult>('/plan', {
    text: input.text,
    audio_base64: input.audioBase64,
    image_base64: input.imageBase64,
    mime_type: input.mimeType,
    existing_tracks: input.existingTracks,
    categories: input.categories,
    recent_transactions: input.recentTransactions ?? [],
    today: todayKey(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}
