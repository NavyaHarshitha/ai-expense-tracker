import { useEffect, useState } from 'react'

import { toPaise } from '../lib/money'
import {
  MOVEMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  type Movement,
  type PaymentMethod,
  type Track,
  type Transaction,
} from '../lib/types'
import { cardPadded, field, fieldLabel, linkButton, primaryButton, sectionTitle } from '../lib/ui'

const CATEGORIES = ['Food', 'Transport', 'Groceries', 'Shopping', 'Bills', 'Health', 'Other']

function todayIso() {
  // Local date, not UTC - an expense at 1am IST belongs to today, not yesterday.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/*
One form, two jobs: adding, and editing an existing row.

When `editing` is set the fields are filled from that transaction and the
button becomes Update - the same pattern the original vanilla app used with
setEditingId, rather than a separate edit screen.

Defaults make the common case three fields: amount, what it was, which track.
*/
export function QuickAdd({
  tracks,
  editing,
  onAdd,
  onUpdate,
  onCancelEdit,
}: {
  tracks: Track[]
  editing?: Transaction | null
  onAdd: (txn: Omit<Transaction, 'id'>) => Promise<void>
  onUpdate: (id: string, patch: Partial<Transaction>) => Promise<void>
  onCancelEdit: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryName, setCategoryName] = useState('Food')
  const [trackId, setTrackId] = useState('')
  const [movement, setMovement] = useState<Movement>('expense')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  /*
  Default to a spending track, never whichever track Firestore returned first.
  Landing a ₹250 lunch on the Home Loan EMI commitment is wrong and hard to notice.
  */
  const defaultTrack = tracks.find((t) => t.type === 'spending') ?? tracks[0]
  const effectiveTrackId = trackId || defaultTrack?.id || ''

  function reset() {
    setAmount('')
    setDescription('')
    setCategoryName('Food')
    setTrackId('')
    setMovement('expense')
    setPaymentMethod('upi')
    setOccurredOn(todayIso())
    setNote('')
    setShowNote(false)
  }

  // Load the row being edited into the form, and clear it when editing stops.
  useEffect(() => {
    if (!editing) {
      reset()
      return
    }
    setAmount(String(editing.amountMinor / 100))
    setDescription(editing.description)
    setCategoryName(editing.categoryName)
    setTrackId(editing.trackId)
    setMovement(editing.movement)
    setPaymentMethod(editing.paymentMethod)
    setOccurredOn(editing.occurredOn)
    setNote(editing.note ?? '')
    setShowNote(Boolean(editing.note))
  }, [editing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amountMinor = toPaise(amount)
    if (amountMinor <= 0 || !effectiveTrackId || busy) return

    setBusy(true)

    const fields = {
      occurredOn,
      amountMinor,
      movement,
      trackId: effectiveTrackId,
      categoryName,
      description: description.trim() || categoryName,
      // Written explicitly so clearing a note actually clears it.
      note: note.trim() || '',
      paymentMethod,
    }

    if (editing) {
      await onUpdate(editing.id, fields)
      onCancelEdit()
      setFlash('Updated')
    } else {
      await onAdd({ ...fields, source: 'manual', createdAt: Date.now(), deletedAt: null })
      reset()
      setFlash('Saved')
    }

    setBusy(false)
    setTimeout(() => setFlash(''), 2000)
  }

  if (tracks.length === 0) {
    return (
      <section className={cardPadded}>
        <p className="m-0 text-center text-muted">
          Create a track on the Home page first &mdash; every expense comes out of one.
        </p>
      </section>
    )
  }

  return (
    <section className={`${cardPadded} ${editing ? 'border-l-4 border-l-primary' : ''}`}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={`${sectionTitle} mb-0`}>{editing ? 'Edit Expense' : 'Add Expense'}</h2>
        {editing && (
          <span className="text-sm text-muted">
            Editing &ldquo;{editing.description}&rdquo; from {editing.occurredOn}
          </span>
        )}
      </div>

      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={fieldLabel} htmlFor="qa-amount">
              Amount
            </label>
            <input
              id="qa-amount"
              className={`${field} tnum`}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="250"
              required
            />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="qa-desc">
              Description
            </label>
            <input
              id="qa-desc"
              className={field}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lunch, Uber, groceries"
            />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="qa-track">
              Track
            </label>
            <select
              id="qa-track"
              className={field}
              value={effectiveTrackId}
              onChange={(e) => setTrackId(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="qa-cat">
              Category
            </label>
            <select
              id="qa-cat"
              className={field}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={fieldLabel} htmlFor="qa-date">
              Date
            </label>
            <input
              id="qa-date"
              className={field}
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>

          <div>
            <label className={fieldLabel} htmlFor="qa-method">
              Payment Method
            </label>
            <select
              id="qa-method"
              className={field}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabel} htmlFor="qa-movement">
              Type
            </label>
            <select
              id="qa-movement"
              className={field}
              value={movement}
              onChange={(e) => setMovement(e.target.value as Movement)}
            >
              {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showNote ? (
          <div>
            <label className={fieldLabel} htmlFor="qa-note">
              Note &mdash; why, or what it meant
            </label>
            <input
              id="qa-note"
              className={field}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Amma's birthday dinner"
            />
          </div>
        ) : (
          <button
            type="button"
            className={`${linkButton} justify-self-start`}
            onClick={() => setShowNote(true)}
          >
            + Add a note
          </button>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Update Expense' : 'Save Expense'}
          </button>

          {editing && (
            <button type="button" className={linkButton} onClick={onCancelEdit}>
              Cancel
            </button>
          )}

          {flash && <span className="text-sm font-bold text-good">{flash}</span>}
        </div>
      </form>
    </section>
  )
}
