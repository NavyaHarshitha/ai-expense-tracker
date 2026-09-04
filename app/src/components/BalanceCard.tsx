import { useState } from 'react'

import type { BalanceResult } from '../lib/balance'
import { formatINR, toPaise } from '../lib/money'
import { card, eyebrow, field, linkButton, primaryButton } from '../lib/ui'

/*
Bank balance, stated honestly.

This is not a bank feed - it is your own asserted figure plus everything logged
since. So the card says where it came from, and offers to re-anchor rather than
implying it is authoritative. A number that claims more accuracy than it has is
worse than one that admits its source.
*/
export function BalanceCard({
  balance,
  todayIso,
  onAnchor,
}: {
  balance: BalanceResult
  todayIso: string
  onAnchor: (minor: number, on: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [on, setOn] = useState(todayIso)
  const [busy, setBusy] = useState(false)

  const rupees = Number(draft.replace(/[,\s₹]/g, ''))
  const valid = draft.trim() !== '' && Number.isFinite(rupees)

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    await onAnchor(toPaise(draft), on || todayIso)
    setBusy(false)
    setOpen(false)
    setDraft('')
  }

  if (balance.unset && !open) {
    return (
      <section className={`${card} p-6`}>
        <span className={eyebrow}>Bank balance</span>
        <p className="mt-2 mb-4 text-muted">
          Tell it what your account holds right now and it will keep a running figure from
          everything you log after that.
        </p>
        <button type="button" className={primaryButton} onClick={() => setOpen(true)}>
          Set balance
        </button>
      </section>
    )
  }

  const negative = balance.balanceMinor < 0

  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className={eyebrow}>Bank balance</span>
        {!open && (
          <button type="button" className={linkButton} onClick={() => setOpen(true)}>
            Correct it
          </button>
        )}
      </div>

      {!open && (
        <>
          <p
            className={`tnum m-0 mt-2 text-4xl font-extrabold tracking-tight ${
              negative ? 'text-danger' : 'text-ink'
            }`}
          >
            {formatINR(balance.balanceMinor)}
          </p>

          <p className="mt-2 mb-0 text-sm text-muted">
            <span className="tnum">{formatINR(balance.anchorMinor)}</span> on {balance.anchorOn},
            then{' '}
            <span className="tnum font-bold text-good">+{formatINR(balance.inMinor)}</span> in and{' '}
            <span className="tnum font-bold text-ink">−{formatINR(balance.outMinor)}</span> out
            across {balance.countedRows} entr{balance.countedRows === 1 ? 'y' : 'ies'}.
          </p>

          <p className="mt-2 mb-0 text-sm text-muted">
            Computed from what you&rsquo;ve logged, not read from your bank &mdash; so if it has
            drifted, correct it and it re-bases from there.
          </p>
        </>
      )}

      {open && (
        <div className="mt-4 grid gap-3 sm:max-w-md">
          <label className="grid gap-1 text-sm font-bold text-ink-soft">
            What your account actually holds
            <input
              className={`${field} tnum`}
              type="number"
              step="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="84000"
              autoFocus
            />
          </label>

          <label className="grid gap-1 text-sm font-bold text-ink-soft">
            As of
            <input
              className={field}
              type="date"
              value={on}
              max={todayIso}
              onChange={(e) => setOn(e.target.value)}
            />
          </label>

          <p className="m-0 text-sm text-muted">
            Anything logged before this date stops affecting the figure.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButton} disabled={!valid || busy} onClick={save}>
              {busy ? 'Saving…' : 'Save balance'}
            </button>
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                setOpen(false)
                setDraft('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
