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
    <section aria-labelledby="sts-heading" className={`${card} border-l-4 border-l-primary p-6`}>
      <h2 id="sts-heading" className={eyebrow}>
        Safe to spend today
      </h2>

      {/*
      A live region, because this figure changes without the user navigating:
      saving an expense, a Firestore push from another device, or midnight
      rolling the day over. Sighted users see it move; without aria-live a
      screen-reader user is simply never told.

      The visible text is the amount alone - big and glanceable. The label
      carries the whole sentence, so it is announced as "Safe to spend today,
      Rs 410" rather than a bare number with no subject.
      */}
      <p
        role="status"
        aria-live="polite"
        aria-label={`Safe to spend today: ${formatINR(result.leftTodayMinor)}`}
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
        {result.basis === 'balance' ? (
          <>
            <Row label="In your accounts" value={result.cashMinor} />
            {result.owedMinor > 0 && <Row label="Owed on cards" value={-result.owedMinor} />}
            <Row
              label={
                result.preSalaryHeldMinor > 0
                  ? 'Commitments due, incl. pre-payday'
                  : 'Commitments still due'
              }
              value={-result.committedRemainingMinor}
            />
            <Row label="Savings still to move" value={-result.savingsRemainingMinor} />
            {result.setAsideMinor > 0 && (
              <Row label="Set aside in goals" value={-result.setAsideMinor} />
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
          </>
        )}
      </dl>

      {/*
      Say WHY the money is missing. Held-back cash that just disappears from the
      figure looks like a bug; named, it looks like the protection it is.
      */}
      {result.setAsideMinor > 0 && (
        <p className="mt-4 mb-0 rounded-field bg-primary-soft px-4 py-3 text-sm text-ink-soft">
          <strong className="tnum">{formatINR(result.setAsideMinor)}</strong> is already
          saved toward your goals and still sitting in your accounts. Your balance is
          right &mdash; the money is genuinely there &mdash; it is just spoken for, so
          it is not offered here.
        </p>
      )}

      {result.preSalaryHeldMinor > 0 && (
        <p className="mt-4 mb-0 rounded-field bg-primary-soft px-4 py-3 text-sm text-ink-soft">
          <strong className="tnum">{formatINR(result.preSalaryHeldMinor)}</strong> of that is held
          for bills that fall due before your salary on the {paydayDay}
          {ordinal(paydayDay)} &mdash; they come out of this month&rsquo;s money, not next
          month&rsquo;s, so it stays reserved even once this month&rsquo;s have been paid.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <label htmlFor="payday">Salary lands on day</label>
        <input
          id="payday"
          className="tnum w-16 rounded border border-line-strong bg-surface px-2 py-1 text-right text-ink"
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
        <span>of the month</span>
        {paydayDay === undefined && (
          <span className="text-warn">
            Set this and bills due before payday get held back a month early.
          </span>
        )}
      </div>

      <p className="mt-4 mb-0 text-sm text-muted">
        {result.basis === 'balance' ? (
          <>
            Built from what your accounts actually hold, so it already includes anything left
            over from last month and knows whether your salary has landed. Only commitments
            that <em>haven&rsquo;t gone out yet</em> are subtracted &mdash; the ones already
            paid have reduced your balance.
          </>
        ) : (
          <>
            Built from your typed monthly income. Add an account on the Home page and this
            switches to your real balance, which is more accurate.
          </>
        )}
      </p>
    </section>
  )
}

function ordinal(day?: number): string {
  if (day === undefined) return ''
  if (day % 10 === 1 && day !== 11) return 'st'
  if (day % 10 === 2 && day !== 12) return 'nd'
  if (day % 10 === 3 && day !== 13) return 'rd'
  return 'th'
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-bold text-muted">{label}</dt>
      <dd className="tnum m-0 font-bold text-ink">{formatINR(value)}</dd>
    </div>
  )
}
