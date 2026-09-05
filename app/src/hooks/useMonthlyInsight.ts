import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

import { fetchInsight, type MonthlyInsight } from '../lib/api'
import { db, userPath } from '../lib/firebase'
import { categoryBreakdown } from '../lib/insights'
import { isInMonth, type SafeToSpendResult } from '../lib/safeToSpend'
import type { Track, Transaction } from '../lib/types'

/*
The Gemini-written monthly review, generated once and cached.

Cached in Firestore per month, keyed YYYY-MM, because otherwise every visit to the
Dashboard bills a model call - and the Dashboard is the page you open most. The
cache is the cost guardrail, not a speed optimisation.

The model is handed already-computed figures and asked only to write about them.
It is never asked to calculate: a confidently wrong rupee figure is worse than
no narrative at all.
*/

export interface CachedInsight extends MonthlyInsight {
  generatedAt: number
  /** Figures it was written from, so a stale narrative can be detected. */
  spentRupees: number
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useMonthlyInsight(args: {
  uid: string | undefined
  today: Date
  result: SafeToSpendResult
  transactions: Transaction[]
  tracks: Track[]
  enabled: boolean
}) {
  const { uid, today, result, transactions, tracks, enabled } = args

  const [insight, setInsight] = useState<CachedInsight | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const key = monthKey(today)

  useEffect(() => {
    if (!uid) {
      setInsight(null)
      return
    }

    return onSnapshot(
      doc(db, userPath(uid, 'insights'), key),
      (snap) => setInsight(snap.exists() ? (snap.data() as CachedInsight) : null),
      () => setInsight(null),
    )
  }, [uid, key])

  const generate = useCallback(async () => {
    if (!uid || loading) return

    setLoading(true)
    setError(null)

    try {
      const breakdown = categoryBreakdown(transactions, tracks, today)

      const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const previousSpent = transactions
        .filter((t) => !t.deletedAt && isInMonth(t.occurredOn, previousMonth))
        .reduce(
          (sum, t) =>
            t.movement === 'expense'
              ? sum + t.amountMinor
              : t.movement === 'refund'
                ? sum - t.amountMinor
                : sum,
          0,
        )

      // Rupees, not paise - the model should reason in the units a person speaks.
      const written = await fetchInsight({
        month: today.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
        income_rupees: result.incomeMinor / 100,
        committed_rupees: result.committedMinor / 100,
        planned_savings_rupees: result.plannedSavingsMinor / 100,
        spent_rupees: result.spentMinor / 100,
        safe_to_spend_rupees: result.safeToSpendMinor / 100,
        days_remaining: result.daysRemaining,
        top_categories: breakdown.slice(0, 6).map((s) => ({
          name: s.name,
          rupees: s.valueMinor / 100,
          share: Math.round(s.share * 100),
        })),
        ...(previousSpent > 0 ? { previous_month_spent_rupees: previousSpent / 100 } : {}),
      })

      const payload: CachedInsight = {
        ...written,
        generatedAt: Date.now(),
        spentRupees: result.spentMinor / 100,
      }

      await setDoc(doc(db, userPath(uid, 'insights'), key), payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the review.')
    } finally {
      setLoading(false)
    }
  }, [uid, loading, transactions, tracks, today, result, key])

  /*
  Generate automatically only once per month, and only with something to write
  about. A month with no spending has no review worth billing a call for.
  */
  useEffect(() => {
    if (!enabled || !uid || insight || loading) return
    if (result.spentMinor <= 0) return
    generate()
    // generate is intentionally omitted: including it re-fires on every render
    // as `result` changes, which would bill a call per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, insight, loading, result.spentMinor])

  /** Has spending moved materially since the review was written? */
  const stale =
    insight !== null && Math.abs(result.spentMinor / 100 - insight.spentRupees) > 500

  return { insight, loading, error, stale, regenerate: generate }
}
