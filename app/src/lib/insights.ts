/*
Analytics over the ledger: category breakdowns, daily series, and insights.

All pure functions, so the dashboard can't accidentally depend on Firestore and
every number is unit-testable.

These insights are RULE-BASED, computed from the data. The Gemini-generated
narrative ("your big spends were mostly celebrations, the leak is weekday
delivery") arrives with the assistant - these are the numbers it will reason over.
*/

import { isInMonth } from './safeToSpend'
import type { Track, Transaction } from './types'

/*
Commitments are excluded from every figure on this page, exactly as they are
from Safe-to-Spend.

The reason is the same in both places: an EMI or a SIP was reserved before the
month began, so counting it as spending both double-counts it against the
reserve and drowns out the spending that can actually be changed. A donut
reporting "Mutual Fund 46%" is technically true and useless - you were never
going to skip the SIP.

The money is not hidden; it is reported separately as commitments paid.
*/
export function commitmentTrackIds(tracks: Track[]): Set<string> {
  return new Set(tracks.filter((t) => t.type === 'commitment').map((t) => t.id))
}

function discretionary(rows: Transaction[], tracks: Track[]): Transaction[] {
  const committed = commitmentTrackIds(tracks)
  return rows.filter((t) => !committed.has(t.trackId))
}

/** Net spend of a set of rows: expenses add, refunds subtract, income/transfers ignored. */
function netSpend(rows: Transaction[]): number {
  return rows.reduce((sum, t) => {
    if (t.movement === 'expense') return sum + t.amountMinor
    if (t.movement === 'refund') return sum - t.amountMinor
    return sum
  }, 0)
}

function live(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => !t.deletedAt)
}

export interface CategorySlice {
  name: string
  valueMinor: number
  share: number
}

/** Spend by category for a given month, largest first. */
export function categoryBreakdown(
  transactions: Transaction[],
  tracks: Track[],
  ref: Date,
): CategorySlice[] {
  const rows = discretionary(live(transactions), tracks).filter((t) => isInMonth(t.occurredOn, ref))

  const byCategory = new Map<string, number>()
  for (const t of rows) {
    if (t.movement !== 'expense' && t.movement !== 'refund') continue
    const delta = t.movement === 'expense' ? t.amountMinor : -t.amountMinor
    byCategory.set(t.categoryName, (byCategory.get(t.categoryName) ?? 0) + delta)
  }

  const total = [...byCategory.values()].reduce((a, b) => a + Math.max(0, b), 0)

  return [...byCategory.entries()]
    .filter(([, v]) => v > 0)
    .map(([name, valueMinor]) => ({
      name,
      valueMinor,
      share: total > 0 ? valueMinor / total : 0,
    }))
    .sort((a, b) => b.valueMinor - a.valueMinor)
}

export interface DayPoint {
  day: number
  label: string
  spentMinor: number
}

/** Daily spend series for the month containing `ref`, one point per elapsed day. */
export function dailySeries(
  transactions: Transaction[],
  tracks: Track[],
  ref: Date,
): DayPoint[] {
  const rows = discretionary(live(transactions), tracks).filter((t) => isInMonth(t.occurredOn, ref))
  const lastDay = ref.getDate()

  const byDay = new Map<number, number>()
  for (const t of rows) {
    if (t.movement !== 'expense' && t.movement !== 'refund') continue
    const day = Number(t.occurredOn.split('-')[2])
    const delta = t.movement === 'expense' ? t.amountMinor : -t.amountMinor
    byDay.set(day, (byDay.get(day) ?? 0) + delta)
  }

  return Array.from({ length: lastDay }, (_, i) => {
    const day = i + 1
    return { day, label: String(day), spentMinor: Math.max(0, byDay.get(day) ?? 0) }
  })
}

export interface Summary {
  /** Discretionary only - commitments are reported separately. */
  totalSpentMinor: number
  count: number
  highestMinor: number
  topCategory: string
  /** Commitment-track payments made this month, so the money is still visible. */
  committedPaidMinor: number
}

/** The four headline figures, matching the original dashboard's summary cards. */
export function monthSummary(
  transactions: Transaction[],
  tracks: Track[],
  ref: Date,
): Summary {
  const thisMonth = live(transactions).filter((t) => isInMonth(t.occurredOn, ref))
  const committed = commitmentTrackIds(tracks)

  const spendRows = thisMonth.filter(
    (t) => t.movement === 'expense' && !committed.has(t.trackId),
  )

  const breakdown = categoryBreakdown(transactions, tracks, ref)

  return {
    totalSpentMinor: netSpend(discretionary(thisMonth, tracks)),
    count: spendRows.length,
    // Highest DISCRETIONARY expense - a Rs 15,000 SIP is not the month's
    // biggest decision, it is a standing order.
    highestMinor: spendRows.reduce((max, t) => Math.max(max, t.amountMinor), 0),
    topCategory: breakdown[0]?.name ?? 'None',
    committedPaidMinor: netSpend(thisMonth.filter((t) => committed.has(t.trackId))),
  }
}

export type InsightTone = 'info' | 'warn' | 'good'

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  detail: string
}

function previousMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
}

/**
 * Insights that are predictive where possible.
 *
 * "You've used 60% of your food budget" is a fact. "At this rate it's gone by
 * the 24th" is a decision - so burn rate is projected forward, not just reported.
 */
export function buildInsights(args: {
  tracks: Track[]
  transactions: Transaction[]
  today: Date
  safeToSpendMinor: number
  daysRemaining: number
}): Insight[] {
  const { tracks, transactions, today, safeToSpendMinor, daysRemaining } = args
  const out: Insight[] = []

  const breakdown = categoryBreakdown(transactions, tracks, today)
  const spendable = discretionary(live(transactions), tracks)
  const thisMonth = netSpend(spendable.filter((t) => isInMonth(t.occurredOn, today)))
  const lastMonth = netSpend(spendable.filter((t) => isInMonth(t.occurredOn, previousMonth(today))))

  // 1. Where the money is actually going.
  if (breakdown.length > 0) {
    const top = breakdown[0]
    out.push({
      id: 'top-category',
      tone: 'info',
      title: `${top.name} is your biggest category this month`,
      detail: `₹${Math.round(top.valueMinor / 100).toLocaleString('en-IN')} so far — ${Math.round(
        top.share * 100,
      )}% of everything you've spent.`,
    })
  }

  // 2. Direction of travel, not just the level.
  if (lastMonth > 0 && thisMonth > 0) {
    const change = (thisMonth - lastMonth) / lastMonth
    const pct = Math.abs(Math.round(change * 100))
    if (pct >= 5) {
      out.push({
        id: 'month-trend',
        tone: change > 0 ? 'warn' : 'good',
        title: change > 0 ? `Spending is up ${pct}% on last month` : `Spending is down ${pct}% on last month`,
        detail:
          change > 0
            ? 'Same point in the month, higher total. Worth a look at the category above.'
            : 'You are tracking below last month at the same point.',
      })
    }
  }

  // 3. Burn rate against each spending limit, projected to month end.
  const daysElapsed = today.getDate()
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  for (const track of tracks) {
    if (track.type !== 'spending' || track.archived) continue
    const limit = track.monthlyLimitMinor ?? 0
    if (limit <= 0) continue

    const used = netSpend(
      live(transactions).filter((t) => t.trackId === track.id && isInMonth(t.occurredOn, today)),
    )
    if (used <= 0) continue

    const perDay = used / daysElapsed
    const projected = perDay * daysInThisMonth

    if (projected > limit) {
      // The day the limit is crossed at the current rate.
      const crossOn = Math.ceil(limit / perDay)
      out.push({
        id: `burn-${track.id}`,
        tone: 'warn',
        title:
          crossOn <= daysInThisMonth
            ? `${track.name} runs out around the ${crossOn}th`
            : `${track.name} is on track to overspend`,
        detail: `At ₹${Math.round(perDay / 100).toLocaleString('en-IN')}/day you'd finish the month at about ₹${Math.round(
          projected / 100,
        ).toLocaleString('en-IN')} against a ₹${Math.round(limit / 100).toLocaleString('en-IN')} limit.`,
      })
    } else if (used / limit < 0.6) {
      out.push({
        id: `burn-ok-${track.id}`,
        tone: 'good',
        title: `${track.name} is comfortably on track`,
        detail: `${Math.round((used / limit) * 100)}% used with ${daysRemaining} day${
          daysRemaining === 1 ? '' : 's'
        } to go.`,
      })
    }
  }

  // 4. Overspent overall.
  if (safeToSpendMinor < 0) {
    out.push({
      id: 'over',
      tone: 'warn',
      title: 'You are past your safe-to-spend for the month',
      detail: `Commitments and planned savings are already accounted for, so anything further comes out of savings.`,
    })
  }

  // 5. Locked goals - money that exists but is not available.
  const locked = tracks.filter((t) => t.type === 'goal' && t.raidable === false && !t.archived)
  if (locked.length > 0) {
    out.push({
      id: 'locked',
      tone: 'info',
      title: `${locked.map((t) => t.name).join(', ')} ${locked.length === 1 ? 'is' : 'are'} locked`,
      detail: 'Excluded from spending advice, so a weekend plan will never suggest raiding it.',
    })
  }

  return out
}
