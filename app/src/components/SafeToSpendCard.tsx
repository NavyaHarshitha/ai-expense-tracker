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
          overspent ? 'text-danger' : 'text-primary-dark'
        }`}
      >
        {formatINR(result.todayAllowanceMinor)}
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
