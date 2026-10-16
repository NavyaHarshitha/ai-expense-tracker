import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ActionPlan } from './ActionPlan'
import { ReceiptButton } from './ReceiptButton'
import { HeardPanel } from './HeardPanel'
import { ParsedCandidates, needsConfirmation, type PendingCandidate } from './ParsedCandidates'
import { VoiceButton } from './VoiceButton'
import { useGeminiKey } from '../hooks/useGeminiKey'
import { usePlanExecutor } from '../hooks/usePlanExecutor'
import { useReceiptCapture } from '../hooks/useReceiptCapture'
import { useVoiceCapture } from '../hooks/useVoiceCapture'
import { type ParsedCandidate, planActions } from '../lib/api'
import { defaultAccountId } from '../lib/accounts'
import { toAmountMinor, toPaise } from '../lib/money'
import { definingAmountMinor } from '../lib/tracks'
import { isStructural, normaliseAll, type NormalisedAction } from '../lib/planActions'
import {
  MOVEMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  type Movement,
  type PaymentMethod,
  type Account,
  type Category,
  type Track,
  type Transaction,
} from '../lib/types'
import {
  cardPadded,
  field,
  fieldLabel,
  linkButton,
  primaryButton,
  secondaryButton,
  sectionTitle,
} from '../lib/ui'

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
  categories,
  categoryDocs,
  accounts,
  recent,
  onRenameCategory,
  today,
  editing,
  onAdd,
  onUpdate,
  onDelete,
  onCancelEdit,
}: {
  uid: string
  tracks: Track[]
  categories: string[]
  categoryDocs: Category[]
  accounts: Account[]
  /** Recent rows so voice can refer to one it needs to correct. */
  recent: Transaction[]
  onRenameCategory: (
    uid: string,
    category: Category,
    newName: string,
  ) => Promise<{ rowsUpdated: number }>
  today: Date
  editing?: Transaction | null
  onAdd: (txn: Omit<Transaction, 'id'>) => Promise<string>
  onUpdate: (id: string, patch: Partial<Transaction>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onCancelEdit: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryName, setCategoryName] = useState(categories[0] ?? 'Other')
  const [trackId, setTrackId] = useState('')
  const [movement, setMovement] = useState<Movement>('expense')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi')
  const [occurredOn, setOccurredOn] = useState(todayIso())
  const [accountId, setAccountId] = useState('')
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

  /*
  Defaults to the primary account, and never to a credit card - defaulting
  expenses onto a card would quietly build debt nobody chose.
  */
  const effectiveAccountId = accountId || defaultAccountId(accounts) || ''

  function reset() {
    setAmount('')
    setDescription('')
    setCategoryName(categories[0] ?? 'Other')
    setTrackId('')
    setMovement('expense')
    setPaymentMethod('upi')
    setOccurredOn(todayIso())
    setAccountId('')
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
    setAccountId(editing.accountId ?? '')
    setNote(editing.note ?? '')
    setShowNote(Boolean(editing.note))
  }, [editing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amountMinor = toPaise(amount)
    if (amountMinor <= 0 || !effectiveTrackId || busy) return

    setBusy(true)

    const fields = {
      /*
      Never write a blank date. Clearing the date field yields '', which fails
      both isInMonth and isSameDay - so the expense vanished from Safe-to-Spend,
      the summary, the charts and the daily series, while still appearing in the
      transactions table. A permanent, invisible overstatement.
      */
      occurredOn: occurredOn || todayIso(),
      amountMinor,
      movement,
      trackId: effectiveTrackId,
      categoryName,
      description: description.trim() || categoryName,
      // Written explicitly so clearing a note actually clears it.
      note: note.trim() || '',
      paymentMethod,
      ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
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
  const [transcript, setTranscript] = useState('')
  // Which input produced the current transcript, so the panel can say 'Heard' or 'Read'.
  const [inputKind, setInputKind] = useState<'voice' | 'receipt'>('voice')
  const [replanning, setReplanning] = useState(false)
  const [typed, setTyped] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const executor = usePlanExecutor(uid, tracks, categoryDocs, onRenameCategory, onAdd)
  const geminiKey = useGeminiKey()

  /** Write one expense through the SAME path the form uses - no second way in. */
  const commit = useCallback(
    async (candidate: ParsedCandidate, trackIdForCandidate: string): Promise<string> => {
      return onAdd({
        occurredOn: candidate.occurred_on || todayIso(),
        // toAmountMinor, not toPaise: a model-supplied figure is untrusted input.
        amountMinor: toAmountMinor(candidate.amount_rupees),
        movement: 'expense',
        trackId: trackIdForCandidate,
        categoryName: candidate.category,
        description: candidate.description || candidate.category,
        ...(candidate.note ? { note: candidate.note } : {}),
        paymentMethod: candidate.payment_method,
        ...(defaultAccountId(accounts) ? { accountId: defaultAccountId(accounts) } : {}),
        source: 'voice',
        createdAt: Date.now(),
        deletedAt: null,
      })
    },
    [onAdd, accounts],
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
  /*
  Shared by the microphone and by a corrected transcript, so a re-read behaves
  exactly like the original recording rather than taking a second code path.
  */
  const runPlan = useCallback(
    async (input: {
      audioBase64?: string
      imageBase64?: string
      mimeType?: string
      text?: string
    }) => {
      setParseError(null)
      setVoiceNote(null)

      const result = await planActions({
        ...input,
        existingTracks: tracks.map((t) => ({
          name: t.name,
          type: t.type,
          ...(definingAmountMinor(t) > 0
            ? { amountRupees: definingAmountMinor(t) / 100 }
            : {}),
          ...(t.dueDay !== undefined ? { dueDay: t.dueDay } : {}),
        })),
        categories,
        // Only what is needed to point at a row - never the whole ledger.
        recentTransactions: recent.slice(0, 40).map((t) => ({
          id: t.id,
          date: t.occurredOn,
          description: t.description,
          amount: t.amountMinor / 100,
          category: t.categoryName,
        })),
      })

      // Shown even when nothing is actionable - that is exactly when knowing
      // what it heard is most useful.
      setTranscript(result.transcript ?? '')

      const actions = normaliseAll(result.actions, tracks, today).map((a) => {
        // Label the row being corrected, and say whether a rename is really a merge.
        if (a.kind === 'update_expense') {
          const row = recent.find((t) => t.id === a.transactionId)
          return { ...a, currentDescription: row?.description }
        }
        if (a.kind === 'rename_category') {
          const merge = categoryDocs.some(
            (c) => !c.archived && c.name.toLowerCase() === a.newName.toLowerCase(),
          )
          return { ...a, merge }
        }
        return a
      })

      if (actions.length === 0) {
        /*
        Two different failures were sharing one message.

        "Didn't catch anything" is right when nothing was heard, and actively
        misleading when the transcript above it shows the words repeated back
        correctly - the user then reasonably concludes the app is broken rather
        than that the sentence was understood but not actionable. Say which
        happened.
        */
        setParseError(
          result.reply ||
            (result.transcript
              ? `Heard you, but couldn\u2019t turn that into a change. Try naming an amount \u2014 e.g. \u201cpaid 6000 for SBI Mutual Fund\u201d.`
              : "Didn't catch anything to do there. Try \u201cspent 250 on lunch\u201d, or \u201crent is 18000 due on the 5th\u201d."),
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
    [commit, tracks, categoryDocs, recent, today, uid],
  )

  const handleCaptured = useCallback(
    (audioBase64: string, mimeType: string) => {
      setInputKind('voice')
      return runPlan({ audioBase64, mimeType })
    },
    [runPlan],
  )

  /* Same planner, same preview, same confirmation - only the input differs. */
  const handleReceipt = useCallback(
    (imageBase64: string, mimeType: string) => {
      setInputKind('receipt')
      return runPlan({ imageBase64, mimeType })
    },
    [runPlan],
  )

  /** Re-read corrected words. Clears the old plan first so nothing stale lingers. */
  const handleRetry = useCallback(
    async (text: string) => {
      setReplanning(true)
      setInputKind('voice')
      setPlan([])
      setPending([])
      try {
        await runPlan({ text })
      } finally {
        setReplanning(false)
      }
    },
    [runPlan],
  )

  const voice = useVoiceCapture(handleCaptured)
  const receipt = useReceiptCapture(handleReceipt)

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
      {/*
      Without a key, the microphone would record and then fail. Say what is
      needed and where to get it instead - the form below still works.
      */}
      {!editing && !geminiKey && (
        <div className="mb-6 rounded-field bg-primary-soft px-4 py-4">
          <p className="m-0 font-bold text-ink">Say it instead of typing it</p>
          <p className="mt-1 mb-3 text-ink-soft">
            Voice entry and receipt photos need a free Gemini key. It takes about a minute.
          </p>
          <Link to="/settings" className={secondaryButton}>
            Add your key
          </Link>
        </div>
      )}

      {!editing && geminiKey && (
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

          {/*
          The same planner, reached from a keyboard.

          Voice is the intended input, but a microphone is not always available
          or wanted - a shared office, a declined permission, a desktop without
          one. This sends the identical instruction to the identical endpoint.
          */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const text = typed.trim()
              if (!text || replanning) return
              setTyped('')
              handleRetry(text)
            }}
          >
            <label className="sr-only" htmlFor="typed-instruction">
              Type an instruction
            </label>
            <input
              id="typed-instruction"
              className={field}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…or type it: “spent 250 on lunch”"
              disabled={replanning}
            />
            <button
              type="submit"
              className={secondaryButton}
              disabled={replanning || typed.trim() === ''}
            >
              {replanning ? 'Reading…' : 'Send'}
            </button>
          </form>

          <ReceiptButton
            state={receipt.state}
            error={receipt.error}
            preview={receipt.preview}
            onFile={receipt.capture}
            onDismiss={receipt.reset}
          />

          <HeardPanel
            transcript={transcript}
            kind={inputKind}
            busy={replanning}
            onRetry={handleRetry}
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
            categories={categories}
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
          No tracks yet. Try &ldquo;rent is 18000 due on the 5th&rdquo;, or add one on the Home page.
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
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              required
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

          {accounts.length > 0 && (
            <div>
              <label className={fieldLabel} htmlFor="qa-account">
                Account
              </label>
              <select
                id="qa-account"
                className={field}
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
