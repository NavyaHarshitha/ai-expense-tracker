import { useEffect, useState } from 'react'

import { toPaise } from '../lib/money'
import { definingAmountMinor as amountOf } from '../lib/tracks'
import { TRACK_TYPE_LABELS, type Track, type TrackType } from '../lib/types'
import { cardPadded, field, fieldLabel, linkButton, primaryButton, secondaryButton } from '../lib/ui'

const TYPES: TrackType[] = ['spending', 'commitment', 'goal', 'project']

const HINTS: Record<TrackType, string> = {
  spending: 'Resets every month. Daily Expenses, Eating Out.',
  commitment:
    'Known amount on a known day, reserved up front. EMI, rent, a SIP. Repeats every month, so one track covers every month.',
  goal: 'Accumulates toward a target. Emergency Fund.',
  project: 'Date-bounded: saves, then spends down, then closes. A trip.',
}


export function TrackForm({
  editing,
  onCreate,
  onUpdate,
  onArchive,
  onCancelEdit,
}: {
  editing?: Track | null
  onCreate: (track: Omit<Track, 'id'>) => Promise<void>
  onUpdate: (id: string, patch: Partial<Track>) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onCancelEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TrackType>('spending')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('1')
  const [planned, setPlanned] = useState('')
  const [opening, setOpening] = useState('')
  /* Defaults to true: money you already have is far more often in your bank
     than in an outside fund, and the wrong default here silently overstates
     what is safe to spend. */
  const [openingInAccounts, setOpeningInAccounts] = useState(true)
  const [raidable, setRaidable] = useState(true)
  const [busy, setBusy] = useState(false)

  function reset() {
    setType('spending')
    setName('')
    setAmount('')
    setDueDay('1')
    setPlanned('')
    setOpening('')
    setOpeningInAccounts(true)
    setRaidable(true)
  }

  useEffect(() => {
    if (!editing) return
    setOpen(true)
    setType(editing.type)
    setName(editing.name)
    setAmount(amountOf(editing) ? String(amountOf(editing) / 100) : '')
    setDueDay(String(editing.dueDay ?? 1))
    setPlanned(editing.plannedMonthlyMinor ? String(editing.plannedMonthlyMinor / 100) : '')
    setOpening(editing.openingBalanceMinor ? String(editing.openingBalanceMinor / 100) : '')
    // Existing tracks predate the flag; absent means "held elsewhere", which is
    // the behaviour they already had, so editing one changes nothing by itself.
    setOpeningInAccounts(editing.openingInAccounts === true)
    setRaidable(editing.raidable !== false)
  }, [editing])

  /*
  Build the type-specific fields, writing null for the ones that don't apply.

  This matters on edit: changing a goal into a spending track must clear the old
  targetMinor and plannedMonthlyMinor, or Safe-to-Spend keeps reserving savings
  for a track that no longer has any.
  */
  function fieldsFor(): Partial<Track> {
    const base: Partial<Track> = {
      name: name.trim(),
      type,
      monthlyLimitMinor: null as unknown as undefined,
      commitmentAmountMinor: null as unknown as undefined,
      dueDay: null as unknown as undefined,
      openingBalanceMinor: null as unknown as undefined,
      openingInAccounts: null as unknown as undefined,
      targetMinor: null as unknown as undefined,
      plannedMonthlyMinor: null as unknown as undefined,
      raidable: null as unknown as undefined,
      budgetMinor: null as unknown as undefined,
      phase: null as unknown as undefined,
    }

    if (type === 'spending') base.monthlyLimitMinor = toPaise(amount)
    if (type === 'commitment') {
      base.commitmentAmountMinor = toPaise(amount)
      base.dueDay = Math.min(31, Math.max(1, Number(dueDay) || 1))
    }
    if (type === 'goal') {
      base.targetMinor = toPaise(amount)
      base.plannedMonthlyMinor = toPaise(planned)
      base.openingBalanceMinor = toPaise(opening)
      base.openingInAccounts = openingInAccounts
      base.raidable = raidable
    }
    if (type === 'project') {
      base.budgetMinor = toPaise(amount)
      base.plannedMonthlyMinor = toPaise(planned)
      base.openingBalanceMinor = toPaise(opening)
      base.openingInAccounts = openingInAccounts
      base.phase = editing?.phase ?? 'accumulating'
    }

    return base
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)

    if (editing) {
      await onUpdate(editing.id, fieldsFor())
      onCancelEdit()
    } else {
      await onCreate({ ...fieldsFor(), archived: false } as Omit<Track, 'id'>)
      setOpen(false)
    }

    reset()
    setBusy(false)
  }

  async function archive() {
    if (!editing) return
    setBusy(true)
    await onArchive(editing.id)
    onCancelEdit()
    reset()
    setBusy(false)
  }

  function cancel() {
    if (editing) onCancelEdit()
    setOpen(false)
    reset()
  }

  if (!open && !editing) {
    return (
      <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>
        + New Track
      </button>
    )
  }

  const amountLabel =
    type === 'spending'
      ? 'Monthly limit'
      : type === 'commitment'
        ? 'Amount due'
        : type === 'goal'
          ? 'Target'
          : 'Budget'

  return (
    <section className={`${cardPadded} ${editing ? 'border-l-4 border-l-primary' : ''}`}>
      <form className="grid gap-4" onSubmit={submit}>
        <p className="m-0 font-extrabold text-primary-dark">
          {editing ? `Edit “${editing.name}”` : 'New Track'}
        </p>

        <div>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`rounded-full border px-4 py-2 font-bold transition ${
                  type === t
                    ? 'border-primary bg-primary text-surface'
                    : 'border-line-strong bg-surface text-muted hover:border-primary-edge hover:text-primary-dark'
                }`}
              >
                {TRACK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <p className="mt-3 mb-0 text-sm text-muted">{HINTS[type]}</p>
          {editing && editing.type !== type && (
            <p className="mt-2 mb-0 text-sm font-bold text-danger">
              Changing the type clears the fields that don&rsquo;t apply to {TRACK_TYPE_LABELS[type]}.
            </p>
          )}
        </div>

        <div>
          <label className={fieldLabel} htmlFor="track-name">
            Name
          </label>
          <input
            id="track-name"
            className={field}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'project' ? 'Goa Trip' : 'Daily Expenses'}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabel} htmlFor="track-amount">
              {amountLabel}
            </label>
            <input
              id="track-amount"
              className={`${field} tnum`}
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {type === 'commitment' && (
            <div>
              <label className={fieldLabel} htmlFor="track-due">
                Due day of month
              </label>
              <input
                id="track-due"
                className={`${field} tnum`}
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          )}

          {(type === 'goal' || type === 'project') && (
            <div>
              <label className={fieldLabel} htmlFor="track-planned">
                Set aside per month
              </label>
              <input
                id="track-planned"
                className={`${field} tnum`}
                type="number"
                min="0"
                value={planned}
                onChange={(e) => setPlanned(e.target.value)}
              />
            </div>
          )}
        </div>

        {(type === 'goal' || type === 'project') && (
          <div>
            <label className={fieldLabel} htmlFor="track-opening">
              Already saved
            </label>
            <input
              id="track-opening"
              className={`${field} tnum`}
              type="number"
              min="0"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="60000"
            />
            <p className="mt-1 mb-2 text-sm text-muted">
              Money already in this pot. Counts toward the target without inventing a
              transaction that never happened.
            </p>

            {/*
            Where the money physically is decides whether it is spendable, and
            only the user knows. Ticked, the amount is inside a tracked account
            and gets held back from Safe-to-Spend while the account balance
            still shows it - which is what the bank shows too.
            */}
            <label className="flex items-start gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="mt-1"
                checked={openingInAccounts}
                onChange={(e) => setOpeningInAccounts(e.target.checked)}
              />
              <span>
                This money is sitting in one of my accounts
                <span className="mt-0.5 block text-muted">
                  Set it aside so Safe-to-Spend stops offering it. Your account balance
                  is unchanged &mdash; the money really is still in the bank. Untick if
                  it&rsquo;s held somewhere the app doesn&rsquo;t track, like a mutual fund.
                </span>
              </span>
            </label>
          </div>
        )}

        {type === 'goal' && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={!raidable}
              onChange={(e) => setRaidable(!e.target.checked)}
            />
            Lock this goal &mdash; keep it out of spending advice (e.g. an emergency fund)
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Update Track' : 'Create Track'}
          </button>

          <button type="button" className={linkButton} onClick={cancel}>
            Cancel
          </button>

          {editing && (
            <button
              type="button"
              onClick={archive}
              disabled={busy}
              className="ml-auto rounded-full px-3 py-2 font-bold text-danger transition hover:bg-danger-soft"
            >
              Archive track
            </button>
          )}
        </div>

        {editing && (
          <p className="m-0 text-sm text-muted">
            Archiving hides it from pickers and stops it counting toward Safe-to-Spend. Its history
            stays intact.
          </p>
        )}
      </form>
    </section>
  )
}
