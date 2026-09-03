import { useEffect, useState } from 'react'

import { formatINR, toPaise } from '../lib/money'
import type { SafeToSpendResult } from '../lib/safeToSpend'
import { card, eyebrow } from '../lib/ui'

/*
The hero. This deliberately replaces "Total Spent" as the primary figure:
total spent is a rear-view mirror, safe-to-spend is a decision.
*/
export function SafeToSpendCard({
  result,
  onIncomeChange,
}: {
  result: SafeToSpendResult
  onIncomeChange: (minor: number) => void
}) {
  const overspent = result.safeToSpendMinor < 0
  const dayExhausted =
    result.todayAllowanceMinor > 0 && result.spentTodayMinor > result.todayAllowanceMinor
  /*
  Clamped at BOTH ends. spentTodayMinor goes negative on a net-refund day, which
  produced width: '-25%' - an invalid CSS length that the CSSOM drops entirely,
  leaving the block-level bar to fill its whole track. The bar then read "day
  fully spent" directly under a hero saying money was left.
  */
  const dayUsedPct =
    result.todayAllowanceMinor > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((result.spentTodayMinor / result.todayAllowanceMinor) * 100)),
        )
      : 0

  /*
  Controlled, and re-synced when the stored value arrives. This was previously
  an uncontrolled input with defaultValue, captured on first render while income
  was still loading - so a saved value never appeared in the box.
  */
  const [draft, setDraft] = useState('')

  useEffect(() => {
    setDraft(result.incomeMinor ? String(result.incomeMinor / 100) : '')
  }, [result.incomeMinor])

  function commitIncome() {
    // An empty box means "I didn't touch this", not "my income is zero".
    if (draft.trim() === '') return
    onIncomeChange(toPaise(draft))
  }

  return (
    <section className={`${card} border-l-4 border-l-primary p-6`}>
      <span className={eyebrow}>Safe to spend today</span>

      <p
        className={`tnum m-0 mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl ${
          overspent || dayExhausted ? 'text-danger' : 'text-primary-dark'
        }`}
      >
        {formatINR(result.leftTodayMinor)}
      </p>

      <p className="mt-2 text-muted">
        {overspent ? (
          <>
            You&rsquo;re over by{' '}
            <strong className="tnum text-ink">{formatINR(-result.safeToSpendMinor)}</strong> this
            month
          </>
        ) : (
          <>
            <strong className="tnum text-ink">{formatINR(result.safeToSpendMinor)}</strong> left
            across {result.daysRemaining} day{result.daysRemaining === 1 ? '' : 's'}
          </>
        )}
      </p>

      {/* What today has cost so far, against what today was worth. */}
      {result.todayAllowanceMinor > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">
              {result.spentTodayMinor < 0 ? (
                <>
                  Refunds today put{' '}
                  <strong className="tnum text-good">{formatINR(-result.spentTodayMinor)}</strong>{' '}
                  back
                </>
              ) : result.spentTodayMinor > 0 ? (
                <>
                  <strong className="tnum text-ink">{formatINR(result.spentTodayMinor)}</strong> of{' '}
                  <span className="tnum">{formatINR(result.todayAllowanceMinor)}</span> spent today
                </>
              ) : (
                <>
                  Today&rsquo;s share is{' '}
                  <span className="tnum font-bold text-ink">
                    {formatINR(result.todayAllowanceMinor)}
                  </span>
                </>
              )}
            </span>
            {dayExhausted && (
              <span className="font-bold text-danger">
                Over by {formatINR(result.spentTodayMinor - result.todayAllowanceMinor)}
              </span>
            )}
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-lavender">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                dayExhausted ? 'bg-danger' : 'bg-primary'
              }`}
              style={{ width: `${dayUsedPct}%` }}
            />
          </div>

          <p className="m-0 mt-2 text-sm text-muted">
            Anything you don&rsquo;t spend today rolls into tomorrow &mdash; what&rsquo;s left
            simply divides across one fewer day.
          </p>
        </div>
      )}

      {/* The arithmetic, shown rather than hidden - a number you can't check is a number you won't trust. */}
      <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-line pt-5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4">
          <dt className="font-bold text-muted">Monthly income</dt>
          <dd className="m-0">
            <label className="sr-only" htmlFor="income">
              Monthly income in rupees
            </label>
            <input
              id="income"
              className="tnum w-32 rounded-field border border-line-strong bg-surface px-3 py-2 text-right font-bold text-ink focus:border-primary"
              type="number"
              min="0"
              step="1000"
              value={draft}
              placeholder="0"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitIncome}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </dd>
        </div>

        <Row label="Commitments reserved" value={-result.committedMinor} />
        <Row label="Savings planned" value={-result.plannedSavingsMinor} />
        <Row label="Spent this month" value={-result.spentMinor} />
      </dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-bold text-muted">{label}</dt>
      <dd className="tnum m-0 font-bold text-ink">{formatINR(value)}</dd>
    </div>
  )
}
