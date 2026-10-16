import { useMemo } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Link } from 'react-router-dom'

import { useApp } from '../App'
import { useGeminiKey } from '../hooks/useGeminiKey'
import { useMonthlyInsight } from '../hooks/useMonthlyInsight'
import { formatINR } from '../lib/money'
import {
  buildInsights,
  categoryBreakdown,
  dailySeries,
  monthSummary,
  type InsightTone,
} from '../lib/insights'
import { MAX_PIE_SLICES, chartTheme, card, eyebrow, sectionTitle } from '../lib/ui'

const TONE_STYLES: Record<InsightTone, { border: string; label: string; text: string }> = {
  warn: { border: 'border-l-danger', label: 'Watch', text: 'text-danger' },
  good: { border: 'border-l-good', label: 'On track', text: 'text-good' },
  info: { border: 'border-l-primary', label: 'Insight', text: 'text-primary-dark' },
}

export function Dashboard() {
  const { uid, tracks, transactions, result, today, theme } = useApp()

  // Recharts takes colours as props, so they resolve in JS rather than CSS.
  const chart = useMemo(() => chartTheme(theme), [theme])

  const summary = useMemo(() => monthSummary(transactions, tracks, today), [transactions, tracks, today])
  const breakdown = useMemo(() => categoryBreakdown(transactions, tracks, today), [transactions, tracks, today])
  const series = useMemo(() => dailySeries(transactions, tracks, today), [transactions, tracks, today])

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

  /*
  Past six wedges a ring stops being a comparison and becomes a pattern, and the
  eighth slice is a sliver nobody can act on. The remainder folds into one
  colourless "Other" rather than being dropped - the total still adds up.
  */
  const slices = useMemo(() => {
    if (breakdown.length <= MAX_PIE_SLICES) return breakdown

    const shown = breakdown.slice(0, MAX_PIE_SLICES - 1)
    const rest = breakdown.slice(MAX_PIE_SLICES - 1)

    return [
      ...shown,
      {
        name: `Other (${rest.length})`,
        valueMinor: rest.reduce((sum, s) => sum + s.valueMinor, 0),
        share: rest.reduce((sum, s) => sum + s.share, 0),
      },
    ]
  }, [breakdown])

  const isOther = (i: number) => slices.length > MAX_PIE_SLICES - 1 && i === slices.length - 1

  const monthName = today.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  const geminiKey = useGeminiKey()

  const written = useMonthlyInsight({
    uid,
    today,
    result,
    transactions,
    tracks,
    enabled: transactions.length > 0 && geminiKey !== '',
  })

  if (transactions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong p-12 text-center">
        <h1 className="mb-2 text-2xl font-bold text-ink">Nothing to analyse yet</h1>
        <p className="m-0 text-muted">Add an expense and your charts will appear here.</p>
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
        <Stat
          label="Discretionary spend"
          value={formatINR(summary.totalSpentMinor)}
          hint={
            summary.committedPaidMinor > 0
              ? `plus ${formatINR(summary.committedPaidMinor)} of commitments paid`
              : undefined
          }
        />
        <Stat label="Transactions" value={String(summary.count)} />
        <Stat label="Highest Expense" value={formatINR(summary.highestMinor)} />
        <Stat label="Top Category" value={summary.topCategory} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Where the money went */}
        <section className={`${card} p-6`}>
          <h2 className={`${sectionTitle} mb-1`}>Where it went</h2>
          <p className="mb-4 text-sm text-muted">
            Discretionary spending only &mdash; commitments are excluded.
          </p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices.map((s) => ({ name: s.name, value: s.valueMinor }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="54%"
                  outerRadius="84%"
                  paddingAngle={1}
                  /* A 2px ring of the surface, so touching wedges never blur together. */
                  stroke={chart.surface}
                  strokeWidth={2}
                >
                  {slices.map((_, i) => (
                    <Cell
                      key={i}
                      fill={isOther(i) ? chart.other : chart.series[i % chart.series.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  contentStyle={{
                    borderRadius: 10,
                    background: chart.tooltipBg,
                    border: `1px solid ${chart.tooltipBorder}`,
                    color: chart.tooltipText,
                    fontFamily: 'Arial, sans-serif',
                  }}
                  itemStyle={{ color: chart.tooltipText }}
                  labelStyle={{ color: chart.tooltipText }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* A legend that carries the numbers, so the chart isn't the only source of truth. */}
          <ul className="m-0 mt-4 grid list-none gap-2 p-0">
            {slices.map((slice, i) => (
              <li key={slice.name} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: isOther(i) ? chart.other : chart.series[i % chart.series.length],
                  }}
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
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chart.axis }}
                  axisLine={{ stroke: chart.grid }}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(series.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: chart.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v ? `${Math.round(v / 100000)}k` : '0')}
                />
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  labelFormatter={(l) => `Day ${l}`}
                  /* A crosshair is what makes a line chart readable at a glance. */
                  cursor={{ stroke: chart.axis, strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={{
                    borderRadius: 10,
                    background: chart.tooltipBg,
                    border: `1px solid ${chart.tooltipBorder}`,
                    color: chart.tooltipText,
                    fontFamily: 'Arial, sans-serif',
                  }}
                  itemStyle={{ color: chart.tooltipText }}
                  labelStyle={{ color: chart.tooltipText }}
                />
                <Line
                  type="monotone"
                  dataKey="spentMinor"
                  stroke={chart.line}
                  strokeWidth={2}
                  /* Dots only once the month is short enough for them to be distinct. */
                  dot={series.length <= 20 ? { r: 3, fill: chart.line, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: chart.line, stroke: chart.surface, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="m-0 mt-4 text-sm text-muted">
            Daily discretionary spending across {monthName.split(' ')[0]}. Points on the
            baseline are days you spent nothing.
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
        {!geminiKey && !written.insight && (
          <p className={`${card} mb-4 border-l-4 border-l-primary p-6 text-ink-soft`}>
            Add a free Gemini key in{' '}
            <Link to="/settings" className="font-bold text-primary-dark underline">
              Settings
            </Link>{' '}
            and a written review of your month will appear here.
          </p>
        )}

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
              <p className="m-0 text-muted">Reading your month… this takes a few seconds.</p>
            )}

            {/*
            Shown whenever there is one, including over an existing review.
            A refresh that fails silently is indistinguishable from one that
            hung.
            */}
            {written.error && (
              <p className="m-0 mb-2 text-sm text-danger">{written.error}</p>
            )}

            {written.insight && (
              <>
                <div
                  className={
                    written.loading ? 'opacity-50 transition-opacity' : 'transition-opacity'
                  }
                >
                  <p className="m-0 text-xl font-bold text-ink">{written.insight.headline}</p>
                  <p className="mt-2 mb-0 text-ink-soft">{written.insight.body}</p>
                </div>

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
                  Written from the figures below.
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
          
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="mb-2 font-bold text-muted">{label}</dt>
      <dd className="m-0">
        <span className="tnum block text-[28px] font-bold leading-tight text-ink">{value}</span>
        {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
      </dd>
    </div>
  )
}
