import { useEffect, useState } from 'react'

import { formatINR, toPaise } from '../lib/money'
import type { SafeToSpendResult } from '../lib/safeToSpend'
import { card, eyebrow } from '../lib/ui'

/*
The hero. This deliberately replaces "Total Spent" as the primary figure:
total spent is a rear-view mirror, safe-to-spend is a decision.

Copy rule for this file: label the number, don't justify it. Someone checking
what they can spend before lunch wants the figure and its parts, not an
explanation of the arithmetic. The reasoning belongs in the README.
*/
export function SafeToSpendCard({
  result,
  paydayDay,
  onIncomeChange,
  onPaydayChange,
}: {
  result: SafeToSpendResult
  paydayDay?: number
  onIncomeChange: (minor: number) => void
  onPaydayChange: (day: number | null) => void
}) {
  const overspent = result.safeToSpendMinor < 0
  const dayExhausted =
    result.todayAllowanceMinor > 0 && result.spentTodayMinor > result.todayAllowanceMinor
  /*
  Clamped at both ends. spentTodayMinor is negative on a net-refund day, and a
  negative CSS width is invalid - the CSSOM drops the rule and the bar fills
  its whole track, reading "fully spent" beneath a hero saying otherwise.
  */
  const dayUsedPct =
    result.todayAllowanceMinor > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((result.spentTodayMinor / result.todayAllowanceMinor) * 100)),
        )
      : 0

  /*
  Controlled, and re-synced when the stored value arrives.

  Income loads asynchronously, so the first render has nothing to show. An
  uncontrolled input would capture that empty value and never update.
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
    <section aria-labelledby="sts-heading" className={`${card} border-l-4 border-l-primary p-5`}>
      <h2 id="sts-heading" className={eyebrow}>
        Safe to spend today
      </h2>

      {/*
      A live region, because this figure changes without the user navigating:
      saving an expense, a Firestore push from another device, or midnight
      rolling the day over. Sighted users see it move; without aria-live a
      screen-reader user is simply never told.
      */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p
          role="status"
          aria-live="polite"
          aria-label={`Safe to spend today: ${formatINR(result.leftTodayMinor)}`}
          className={`tnum m-0 text-5xl font-extrabold tracking-tight sm:text-6xl ${
            overspent || dayExhausted ? 'text-danger' : 'text-primary-dark'
          }`}
        >
          {formatINR(result.leftTodayMinor)}
        </p>

        <p className="m-0 text-sm text-muted">
          {overspent ? (
            <>
              over by{' '}
              <strong className="tnum text-danger">{formatINR(-result.safeToSpendMinor)}</strong>{' '}
              this month
            </>
          ) : (
            <>
              <strong className="tnum text-ink">{formatINR(result.safeToSpendMinor)}</strong> left ·{' '}
              {result.daysRemaining} day{result.daysRemaining === 1 ? '' : 's'} to go
            </>
          )}
        </p>
      </div>

      {/* Today against today's share. */}
      {result.todayAllowanceMinor > 0 && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-lavender">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                dayExhausted ? 'bg-danger' : 'bg-primary'
              }`}
              style={{ width: `${dayUsedPct}%` }}
            />
          </div>

          <p className="m-0 mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
            <span>
              {result.spentTodayMinor < 0 ? (
                <>
                  <strong className="tnum text-good">{formatINR(-result.spentTodayMinor)}</strong>{' '}
                  refunded today
                </>
              ) : (
                <>
                  <strong className="tnum text-ink">{formatINR(result.spentTodayMinor)}</strong> of{' '}
                  <span className="tnum">{formatINR(result.todayAllowanceMinor)}</span> spent today
                </>
              )}
            </span>
            {dayExhausted && (
              <span className="font-bold text-danger">
                Over by {formatINR(result.spentTodayMinor - result.todayAllowanceMinor)}
              </span>
            )}
          </p>
        </div>
      )}

      {/* The arithmetic, shown rather than hidden - a number you can't check is a number you won't trust. */}
      <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
        {result.basis === 'balance' ? (
          <>
            <Row label="In your accounts" value={result.cashMinor} />
            {result.owedMinor > 0 && <Row label="Owed on cards" value={-result.owedMinor} />}
            <Row
              label="Commitments due"
              value={-result.committedRemainingMinor}
              hint={
                result.preSalaryHeldMinor > 0
                  ? `incl. ${formatINR(result.preSalaryHeldMinor)} held for bills before payday`
                  : undefined
              }
            />
            <Row label="Savings still to move" value={-result.savingsRemainingMinor} />
            {result.setAsideMinor > 0 && (
              <Row
                label="Set aside in goals"
                value={-result.setAsideMinor}
                hint="in your accounts, but spoken for"
              />
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <dt className="font-bold text-muted">Monthly income</dt>
              <dd className="m-0">
                <label className="sr-only" htmlFor="income">
                  Monthly income in rupees
                </label>
                <input
                  id="income"
                  className="tnum w-28 rounded-field border border-field bg-surface px-3 py-1.5 text-right font-bold text-ink focus:border-primary"
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
          </>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-sm text-muted">
        <label htmlFor="payday">Salary lands on the</label>
        <input
          id="payday"
          className="tnum w-14 rounded border border-field bg-surface px-2 py-1 text-right text-ink"
          type="number"
          min="1"
          max="31"
          defaultValue={paydayDay ?? ''}
          placeholder="—"
          onBlur={(e) => {
            const raw = e.target.value.trim()
            onPaydayChange(raw === '' ? null : Number(raw))
          }}
        />
        <span>of each month</span>

        {paydayDay === undefined && (
          <span className="text-warn">Set this to handle bills due before payday.</span>
        )}

        {result.basis === 'income' && (
          <span className="ml-auto">Add an account to use your real balance.</span>
        )}
      </div>
    </section>
  )
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-bold text-muted">
        {label}
        {hint && <span className="block text-xs font-medium text-muted/80">{hint}</span>}
      </dt>
      <dd className="tnum m-0 shrink-0 font-bold text-ink">{formatINR(value)}</dd>
    </div>
  )
}
