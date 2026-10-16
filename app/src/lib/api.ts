/*
The app's two AI features, as the rest of the client sees them.

Both run on the user's own Gemini key (see gemini.ts and geminiKey.ts). The
signatures predate that move - they were once calls to a Cloud Run service - and
were kept, so nothing that plans or writes a review had to change with it.
*/

import { todayKey } from '../hooks/useToday'
import {
  MODEL,
  buildInsightRequest,
  buildPlanRequest,
  generate,
  readInsightResponse,
  readPlanResponse,
  type InsightFigures,
} from './gemini'
import { readGeminiKey } from './geminiKey'
import type { Movement, PaymentMethod } from './types'

export { ApiError } from './gemini'

/** One expense pulled from speech. Snake_case because it mirrors the model's output. */
export interface ParsedCandidate {
  amount_rupees: number
  description: string
  category: string
  payment_method: PaymentMethod
  occurred_on?: string
  note?: string
  confidence: number
  /** Absent means expense. "Ajio credited 509" is a refund, and must stay one. */
  movement?: Movement
}

export interface MonthlyInsight {
  headline: string
  body: string
  actions: string[]
  model: string
}

export async function fetchInsight(figures: InsightFigures): Promise<MonthlyInsight> {
  const response = await generate(readGeminiKey(), buildInsightRequest(figures))
  return { ...readInsightResponse(response), model: MODEL }
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
 * Only track names, types and defining amounts are sent - never the ledger -
 * which keeps the prompt small however large the ledger gets.
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
  const request = buildPlanRequest({
    ...input,
    recentTransactions: input.recentTransactions ?? [],
    // The device's own date: "spent 600 on dinner" at 1am IST belongs to today.
    today: todayKey(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

  const response = await generate(readGeminiKey(), request)
  return { ...readPlanResponse(response), model: MODEL }
}
