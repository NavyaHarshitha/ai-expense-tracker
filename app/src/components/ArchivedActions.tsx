import { useState } from 'react'

import { linkButton } from '../lib/ui'

/*
Restore or delete, for anything sitting in an archive.

Archiving and deleting answer different questions - "I am done with this" and
"this should never have existed" - and an archive that only offers the first
becomes a drawer nothing ever leaves. Both actions live together here so the
three archive lists (tracks, accounts, categories) behave identically rather
than each growing its own variant.

Delete asks for confirmation and states the consequence in the same breath.
A permanent action whose effect is only discovered afterwards is the kind
people learn to distrust, so the count of affected rows is part of the prompt
rather than something to find out later.
*/
export function ArchivedActions({
  onRestore,
  onDelete,
  consequence,
}: {
  onRestore: () => void
  onDelete: () => void
  /** What deleting will do, when it does anything beyond removing the record. */
  consequence?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!confirming) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-3">
        <button type="button" className={linkButton} onClick={onRestore}>
          Restore
        </button>
        <button
          type="button"
          className="rounded px-1 text-sm font-bold text-danger hover:underline"
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>
      </span>
    )
  }

  return (
    <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
      {consequence && <span className="text-xs text-warn">{consequence}</span>}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          onDelete()
        }}
        className="rounded border border-danger px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger-soft disabled:opacity-50"
      >
        {busy ? '…' : 'Delete for good'}
      </button>
      <button
        type="button"
        className="rounded px-2 py-0.5 text-xs font-bold text-muted hover:underline"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </span>
  )
}
