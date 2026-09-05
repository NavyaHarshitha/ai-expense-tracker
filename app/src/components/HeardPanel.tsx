import { useEffect, useState } from 'react'

import { card, field, linkButton, primaryButton } from '../lib/ui'

/*
What the model heard, shown back verbatim.

Without this a mishearing is invisible: you see "Confirm Rs 5,000" with no way
to tell whether you said five thousand or five hundred. Showing the words makes
the error obvious at a glance, and being able to correct them re-runs the plan
from text - no second recording, no repeating yourself to a phone.
*/
export function HeardPanel({
  transcript,
  kind = 'voice',
  busy,
  onRetry,
}: {
  transcript: string
  /** A photo is read, not heard - the label should say which. */
  kind?: 'voice' | 'receipt'
  busy: boolean
  onRetry: (text: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(transcript)

  // A new recording replaces the draft; an in-progress edit is not clobbered.
  useEffect(() => {
    setDraft(transcript)
    setEditing(false)
  }, [transcript])

  if (!transcript) return null

  const changed = draft.trim() !== '' && draft.trim() !== transcript.trim()

  return (
    <div className={`${card} border-l-4 border-l-line-strong p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-extrabold uppercase tracking-wider text-muted">
          {kind === 'receipt' ? 'Read from the bill' : 'Heard'}
        </span>

        {!editing && (
          <button
            type="button"
            className={linkButton}
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            {kind === 'receipt' ? 'Not right' : 'Not what I said'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 grid gap-3">
          <label className="sr-only" htmlFor="heard-edit">
            Correct what you said
          </label>
          <textarea
            id="heard-edit"
            className={`${field} min-h-20`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={!changed || busy}
              onClick={() => onRetry(draft.trim())}
            >
              {busy ? 'Reading again…' : 'Try again'}
            </button>
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                setDraft(transcript)
                setEditing(false)
              }}
            >
              Cancel
            </button>
          </div>

          <p className="m-0 text-sm text-muted">
            Fix the words and it re-reads them &mdash; no need to
            {kind === 'receipt' ? ' photograph it again.' : ' record again.'}
          </p>
        </div>
      ) : (
        <p className="m-0 mt-1 text-lg italic text-ink">&ldquo;{transcript}&rdquo;</p>
      )}
    </div>
  )
}
