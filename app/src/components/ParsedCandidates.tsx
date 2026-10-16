import { useState } from 'react'

import type { ParsedCandidate } from '../lib/api'
import { formatINR, toPaise } from '../lib/money'
import { MOVEMENT_LABELS, PAYMENT_METHOD_LABELS, type PaymentMethod, type Track } from '../lib/types'
import { field, linkButton, primaryButton } from '../lib/ui'

/** Refunds and income are money coming back, and are shown with a + to say so. */
function moneyIn(candidate: ParsedCandidate): boolean {
  return candidate.movement === 'refund' || candidate.movement === 'income'
}

/**
 * Above this, a human taps to confirm. Below it, the expense commits straight
 * away with an Undo.
 *
 * Voice mishears numbers - "one hundred" and "one thousand" are one bad audio
 * frame apart, and a silent 10x error in a financial record destroys trust in
 * the whole app. But confirming every chai gets tiring by day four, so the
 * friction is graded rather than uniform.
 */
export const CONFIRM_ABOVE_MINOR = toPaise(500)

/** Low confidence always confirms, whatever the amount. */
export const CONFIDENCE_FLOOR = 0.7

export interface PendingCandidate {
  key: string
  candidate: ParsedCandidate
  trackId: string
  status: 'pending' | 'saved'
  /** Firestore id once written, so Undo can actually remove it. */
  savedId?: string
}

export function needsConfirmation(candidate: ParsedCandidate): boolean {
  return (
    toPaise(candidate.amount_rupees) >= CONFIRM_ABOVE_MINOR ||
    candidate.confidence < CONFIDENCE_FLOOR
  )
}

export function ParsedCandidates({
  pending,
  tracks,
  categories,
  onSave,
  onDiscard,
  onUndo,
}: {
  pending: PendingCandidate[]
  tracks: Track[]
  categories: string[]
  onSave: (key: string, edited: ParsedCandidate, trackId: string) => Promise<void>
  onDiscard: (key: string) => void
  onUndo: (key: string) => Promise<void>
}) {
  if (pending.length === 0) return null

  return (
    <div className="grid gap-3">
      {pending.length > 1 && (
        <p className="m-0 text-sm font-bold text-muted">
          Heard {pending.length} expenses in that
        </p>
      )}

      {pending.map((item) =>
        item.status === 'saved' ? (
          <SavedRow key={item.key} item={item} onUndo={onUndo} />
        ) : (
          <ConfirmCard
            key={item.key}
            item={item}
            tracks={tracks}
            categories={categories}
            onSave={onSave}
            onDiscard={onDiscard}
          />
        ),
      )}
    </div>
  )
}

function SavedRow({
  item,
  onUndo,
}: {
  item: PendingCandidate
  onUndo: (key: string) => Promise<void>
}) {
  const [undoing, setUndoing] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-line bg-primary-soft px-4 py-3">
      <p className="m-0">
        <span className="font-extrabold text-good">Saved</span>{' '}
        <span className="tnum font-bold text-ink">
          {moneyIn(item.candidate) ? '+' : ''}
          {formatINR(toPaise(item.candidate.amount_rupees))}
        </span>{' '}
        <span className="text-muted">
          &middot; {item.candidate.description} &middot; {item.candidate.category}
          {item.candidate.movement && item.candidate.movement !== 'expense' && (
            <> &middot; {MOVEMENT_LABELS[item.candidate.movement]}</>
          )}
        </span>
      </p>

      <button
        type="button"
        className={linkButton}
        disabled={undoing}
        onClick={async () => {
          setUndoing(true)
          await onUndo(item.key)
        }}
      >
        {undoing ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}

function ConfirmCard({
  item,
  tracks,
  categories,
  onSave,
  onDiscard,
}: {
  item: PendingCandidate
  tracks: Track[]
  categories: string[]
  onSave: (key: string, edited: ParsedCandidate, trackId: string) => Promise<void>
  onDiscard: (key: string) => void
}) {
  const [amount, setAmount] = useState(String(item.candidate.amount_rupees))
  const [description, setDescription] = useState(item.candidate.description)
  const [category, setCategory] = useState(item.candidate.category)
  const [method, setMethod] = useState<PaymentMethod>(item.candidate.payment_method)
  const [trackId, setTrackId] = useState(item.trackId)
  const [busy, setBusy] = useState(false)

  const lowConfidence = item.candidate.confidence < CONFIDENCE_FLOOR

  /*
  A negative amount here would conjure spendable money: leftToday becomes
  allowance - (-5000), and the month's remainder grows. min="0" on the input is
  not enforced outside form validation, and this card has no form, so the guard
  has to be explicit.
  */
  const amountRupees = Number(amount)
  const amountValid = Number.isFinite(amountRupees) && amountRupees > 0

  return (
    <div className="rounded-card border border-line border-l-4 border-l-primary bg-surface p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 font-extrabold text-primary-dark">Confirm this expense</p>
        {lowConfidence && (
          <span className="text-sm font-bold text-danger">
            Not sure it heard that right — please check
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-bold text-ink-soft">
          Amount
          <input
            className={`${field} tnum`}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            /* Focused so a misheard amount is one keystroke from being fixed. */
            autoFocus
          />
        </label>

        <label className="grid gap-1 text-sm font-bold text-ink-soft">
          Description
          <input
            className={field}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm font-bold text-ink-soft">
          Category
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-bold text-ink-soft">
          Track
          <select className={field} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={busy || !amountValid}
          onClick={async () => {
            if (!amountValid) return
            setBusy(true)
            await onSave(
              item.key,
              {
                ...item.candidate,
                amount_rupees: amountRupees,
                description,
                category,
                payment_method: method,
              },
              trackId,
            )
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>

        <select
          className={`${field} w-auto`}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          aria-label="Payment method"
        >
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <button type="button" className={linkButton} onClick={() => onDiscard(item.key)}>
          Discard
        </button>
      </div>

      {!amountValid && (
        <p className="m-0 mt-2 text-sm font-bold text-danger">
          Enter an amount greater than zero.
        </p>
      )}
    </div>
  )
}
