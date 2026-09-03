import { useCallback, useEffect, useState } from 'react'

import { ActionPlan } from './ActionPlan'
import { ParsedCandidates, needsConfirmation, type PendingCandidate } from './ParsedCandidates'
import { VoiceButton } from './VoiceButton'
import { usePlanExecutor } from '../hooks/usePlanExecutor'
import { useVoiceCapture } from '../hooks/useVoiceCapture'
import { type ParsedCandidate, planActions } from '../lib/api'
import { toPaise } from '../lib/money'
import { isStructural, normaliseAll, type NormalisedAction } from '../lib/planActions'
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
  uid,
  tracks,
  editing,
  onAdd,
  onUpdate,
  onDelete,
  onCancelEdit,
}: {
  uid: string
  tracks: Track[]
  editing?: Transaction | null
  onAdd: (txn: Omit<Transaction, 'id'>) => Promise<string>
  onUpdate: (id: string, patch: Partial<Transaction>) => Promise<void>
  onDelete: (id: string) => Promise<void>
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

  // ---------------- voice: one mic, two outcomes ----------------

  const [pending, setPending] = useState<PendingCandidate[]>([])
  const [plan, setPlan] = useState<NormalisedAction[]>([])
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const executor = usePlanExecutor(uid, tracks, onAdd)

  /** Write one expense through the SAME path the form uses - no second way in. */
  const commit = useCallback(
    async (candidate: ParsedCandidate, trackIdForCandidate: string): Promise<string> => {
      return onAdd({
        occurredOn: candidate.occurred_on || todayIso(),
        amountMinor: toPaise(candidate.amount_rupees),
        movement: 'expense',
        trackId: trackIdForCandidate,
        categoryName: candidate.category,
        description: candidate.description || candidate.category,
        ...(candidate.note ? { note: candidate.note } : {}),
        paymentMethod: candidate.payment_method,
        source: 'voice',
        createdAt: Date.now(),
        deletedAt: null,
      })
    },
    [onAdd],
  )

  /*
  Everything spoken goes to the planner, because "spent 250 on lunch" and "my
  rent is 18000 due on the 5th" are the same gesture to a person and should not
  need two different buttons.

  What comes back is then split by consequence:
  - expenses are graded by amount (small ones commit with an Undo)
  - structural changes always wait for an explicit Apply, because a wrong track
    quietly distorts Safe-to-Spend every month afterwards
  */
  const handleCaptured = useCallback(
    async (audioBase64: string, mimeType: string) => {
      setParseError(null)
      setVoiceNote(null)

      const result = await planActions({
        audioBase64,
        mimeType,
        existingTracks: tracks.map((t) => ({ name: t.name, type: t.type })),
        categories: CATEGORIES,
      })

      const actions = normaliseAll(result.actions, tracks)

      if (actions.length === 0) {
        setParseError(
          result.reply ||
            "Didn't catch anything to do there. Try \u201cspent 250 on lunch\u201d, or \u201crent is 18000 due on the 5th\u201d.",
        )
        return
      }

      const structural = actions.filter(isStructural)
      const expenses = actions.filter((a) => !isStructural(a))

      /*
      If the utterance changes structure at all, EVERYTHING goes into the plan and
      applies together behind one tap - expenses included.

      This is an ordering requirement, not a preference. An expense may depend on
      a track created by the same sentence, so letting small expenses auto-commit
      here would write them before their track existed. The same applies with no
      tracks at all: there is nothing to attach to yet, so a home has to be
      created first and shown in the preview rather than conjured silently.
      */
      const noTracksYet = tracks.length === 0
      const routeAllToPlan = structural.length > 0 || (noTracksYet && expenses.length > 0)

      if (routeAllToPlan) {
        const needsHome = noTracksYet && !actions.some((a) => a.kind === 'create_track')

        const home: NormalisedAction[] = needsHome
          ? [{ kind: 'create_track', name: 'Daily Expenses', type: 'spending' }]
          : []

        setPlan((prev) => [...prev, ...home, ...actions])
        return
      }

      if (expenses.length > 0) {
        const fallbackTrack = tracks.find((t) => t.type === 'spending') ?? tracks[0]

        const items: PendingCandidate[] = expenses.map((a, i) => ({
          key: `${Date.now()}-${i}`,
          candidate: {
            amount_rupees: a.kind === 'create_expense' ? a.amountMinor / 100 : 0,
            description: a.kind === 'create_expense' ? a.description : '',
            category: a.kind === 'create_expense' ? a.category : 'Other',
            payment_method: a.kind === 'create_expense' ? a.paymentMethod : 'upi',
            occurred_on: a.kind === 'create_expense' ? (a.occurredOn ?? '') : '',
            note: a.kind === 'create_expense' ? (a.note ?? '') : '',
            // The planner does not score confidence, so amount alone decides
            // whether this needs a tap.
            confidence: 1,
          },
          trackId:
            (a.kind === 'create_expense' &&
              a.trackName &&
              tracks.find((t) => t.name.toLowerCase() === a.trackName!.toLowerCase())?.id) ||
            fallbackTrack?.id ||
            '',
          status: 'pending',
        }))

        await Promise.all(
          items.map(async (item) => {
            if (!needsConfirmation(item.candidate) && item.trackId) {
              item.savedId = await commit(item.candidate, item.trackId)
              item.status = 'saved'
            }
          }),
        )

        setPending((prev) => [...items, ...prev])
      }
    },
    [commit, tracks, uid],
  )

  const voice = useVoiceCapture(handleCaptured)

  async function applyPlan() {
    const result = await executor.apply(plan)
    if (!result) return

    const bits: string[] = []
    if (result.tracksCreated) bits.push(`${result.tracksCreated} track${result.tracksCreated === 1 ? '' : 's'} created`)
    if (result.tracksUpdated) bits.push(`${result.tracksUpdated} updated`)
    if (result.incomeSet) bits.push('income set')
    if (result.expenseIds.length) bits.push(`${result.expenseIds.length} expense${result.expenseIds.length === 1 ? '' : 's'} recorded`)

    setVoiceNote(bits.join(' · '))
    setPlan([])
    setTimeout(() => setVoiceNote(null), 4000)
  }

  async function saveCandidate(key: string, edited: ParsedCandidate, trackIdForCandidate: string) {
    const savedId = await commit(edited, trackIdForCandidate)
    setPending((prev) =>
      prev.map((p) => (p.key === key ? { ...p, candidate: edited, status: 'saved', savedId } : p)),
    )
  }

  function discardCandidate(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key))
  }

  /*
  Undo genuinely undoes: it soft-deletes the row that was just written. A button
  labelled Undo that only hid a card would be a UI that lies about what it did.
  */
  async function undoCandidate(key: string) {
    const item = pending.find((p) => p.key === key)
    if (item?.savedId) await onDelete(item.savedId)
    setPending((prev) => prev.filter((p) => p.key !== key))
  }

  return (
    <section className={`${cardPadded} ${editing ? 'border-l-4 border-l-primary' : ''}`}>
      {!editing && (
        <div className="mb-6 grid gap-4">
          <VoiceButton
            state={voice.state}
            error={voice.error ?? parseError}
            supported={voice.supported}
            onStart={voice.start}
            onStop={voice.stop}
            onCancel={voice.cancel}
            onDismissError={() => {
              voice.reset()
              setParseError(null)
            }}
          />

          <ActionPlan
            actions={plan}
            applying={executor.applying}
            error={executor.error}
            onApply={applyPlan}
            onDiscard={() => {
              setPlan([])
              executor.clearError()
            }}
            onRemove={(index) => setPlan((prev) => prev.filter((_, i) => i !== index))}
          />

          <ParsedCandidates
            pending={pending}
            tracks={tracks}
            onSave={saveCandidate}
            onDiscard={discardCandidate}
            onUndo={undoCandidate}
          />

          {voiceNote && (
            <p className="m-0 rounded-field bg-primary-soft px-4 py-3 font-bold text-good">
              {voiceNote}
            </p>
          )}
        </div>
      )}

      {tracks.length === 0 && !editing ? (
        <p className="m-0 text-center text-muted">
          No tracks yet. Speak to set one up &mdash; try &ldquo;rent is 18000 due on the 5th&rdquo;
          &mdash; or add one by hand on the Home page.
        </p>
      ) : (
        <>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={`${sectionTitle} mb-0`}>
          {editing ? 'Edit Expense' : 'Or type it in'}
        </h2>
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
        </>
      )}
    </section>
  )
}
