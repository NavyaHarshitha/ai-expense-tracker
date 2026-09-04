import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useApp } from '../App'
import { useMonthlyInsight } from '../hooks/useMonthlyInsight'
import { formatINR } from '../lib/money'
import {
  buildInsights,
  categoryBreakdown,
  dailySeries,
  monthSummary,
  type InsightTone,
} from '../lib/insights'
import { CHART_COLORS, card, eyebrow, sectionTitle } from '../lib/ui'

const TONE_STYLES: Record<InsightTone, { border: string; label: string; text: string }> = {
  warn: { border: 'border-l-danger', label: 'Watch', text: 'text-danger' },
  good: { border: 'border-l-good', label: 'On track', text: 'text-good' },
  info: { border: 'border-l-primary', label: 'Insight', text: 'text-primary-dark' },
}

export function Dashboard() {
  const { uid, tracks, transactions, result, today } = useApp()

  const summary = useMemo(() => monthSummary(transactions, today), [transactions, today])
  const breakdown = useMemo(() => categoryBreakdown(transactions, today), [transactions, today])
  const series = useMemo(() => dailySeries(transactions, today), [transactions, today])

  const insights = useMemo(
    () =>
      buildInsights({
        tracks,
        transactions,
        today,
        safeToSpendMinor: result.safeToSpendMinor,
        daysRemaining: result.daysRemaining,
      }),
    [tracks, transactions, today, result],
  )

  const monthName = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  const written = useMonthlyInsight({
    uid,
    today,
    result,
    transactions,
    enabled: transactions.length > 0,
  })

  if (transactions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong p-12 text-center">
        <h1 className="mb-2 text-2xl font-bold text-ink">Nothing to analyse yet</h1>
        <p className="m-0 text-muted">Add an expense, or seed demo data from the Home page.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="m-0 text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
        <p className="m-0 mt-1 text-muted">{monthName}</p>
      </div>

      {/* The four headline figures, as in the original dashboard. */}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Spent" value={formatINR(summary.totalSpentMinor)} />
        <Stat label="Transactions" value={String(summary.count)} />
        <Stat label="Highest Expense" value={formatINR(summary.highestMinor)} />
        <Stat label="Top Category" value={summary.topCategory} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Where the money went */}
        <section className={`${card} p-6`}>
          <h2 className={sectionTitle}>Where it went</h2>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown.map((s) => ({ name: s.name, value: s.valueMinor }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="52%"
                  outerRadius="82%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    fontFamily: 'Arial, sans-serif',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* A legend that carries the numbers, so the chart isn't the only source of truth. */}
          <ul className="m-0 mt-4 grid list-none gap-2 p-0">
            {breakdown.slice(0, 6).map((slice, i) => (
              <li key={slice.name} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="flex-1 text-ink">{slice.name}</span>
                <span className="tnum font-bold text-ink">{formatINR(slice.valueMinor)}</span>
                <span className="tnum w-10 text-right text-muted">
                  {Math.round(slice.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Daily rhythm */}
        <section className={`${card} p-6`}>
          <h2 className={sectionTitle}>Spend by day</h2>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(series.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v ? `${Math.round(v / 100000)}k` : '0')}
                />
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  labelFormatter={(l) => `Day ${l}`}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    fontFamily: 'Arial, sans-serif',
                  }}
                />
                <Bar dataKey="spentMinor" fill="#db2777" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="m-0 mt-4 text-sm text-muted">
            Each bar is one day of {monthName.split(' ')[0]}. Gaps are days you spent nothing.
          </p>
        </section>
      </div>

      {/* Insights */}
      <section>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[22px] font-bold text-ink">Insights</h2>
          <span className={eyebrow}>Computed from your ledger</span>
        </div>

        {/*
        The written review sits above the rule-based cards, and the cards stay -
        they are the evidence it refers to. If the narrative and the cards
        disagree, the model invented a number and the prompt is wrong.
        */}
        {(written.insight || written.loading || written.error) && (
          <div className={`${card} mb-4 border-l-4 border-l-primary p-6`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <span className={eyebrow}>Written by Gemini</span>
              {written.insight && (
                <button
                  type="button"
                  onClick={written.regenerate}
                  disabled={written.loading}
                  className="rounded-full px-3 py-1 text-sm font-bold text-muted transition hover:bg-primary-soft hover:text-primary-dark disabled:opacity-50"
                >
                  {written.loading ? 'Writing…' : written.stale ? 'Numbers moved — refresh' : 'Refresh'}
                </button>
              )}
            </div>

            {written.loading && !written.insight && (
              <p className="m-0 text-muted">Reading your month…</p>
            )}

            {written.error && !written.insight && (
              <p className="m-0 text-sm text-danger">{written.error}</p>
            )}

            {written.insight && (
              <>
                <p className="m-0 text-xl font-bold text-ink">{written.insight.headline}</p>
                <p className="mt-2 mb-0 text-ink-soft">{written.insight.body}</p>

                {written.insight.actions.length > 0 && (
                  <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                    {written.insight.actions.map((a, i) => (
                      <li key={i} className="flex gap-3 text-ink-soft">
                        <span className="font-extrabold text-primary-dark" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-4 mb-0 text-sm text-muted">
                  Written from the figures below, never calculated by the model &mdash; if a
                  number here disagrees with a card, trust the card.
                </p>
              </>
            )}
          </div>
        )}

        <ul className="m-0 grid list-none gap-3 p-0">
          {insights.map((insight) => {
            const tone = TONE_STYLES[insight.tone]
            return (
              <li key={insight.id} className={`${card} border-l-4 ${tone.border} p-5`}>
                <span className={`text-xs font-extrabold uppercase tracking-wider ${tone.text}`}>
                  {tone.label}
                </span>
                <p className="m-0 mt-1 font-bold text-ink">{insight.title}</p>
                <p className="m-0 mt-1 text-muted">{insight.detail}</p>
              </li>
            )
          })}
        </ul>

        <p className="mt-4 text-sm text-muted">
          The cards above are rule-based, derived directly from your transactions. Asking
          questions in your own words is still to come.
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="mb-2 font-bold text-muted">{label}</dt>
      <dd className="tnum m-0 text-[28px] font-bold leading-tight text-ink">{value}</dd>
    </div>
  )
}
