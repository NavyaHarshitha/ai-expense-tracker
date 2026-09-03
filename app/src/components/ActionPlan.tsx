import { useState } from 'react'

import { describe, type NormalisedAction } from '../lib/planActions'
import { linkButton, primaryButton } from '../lib/ui'

/*
Preview before anything is written.

Structural changes - creating tracks, changing a commitment, setting income -
always confirm, whatever the amount. Getting a track wrong quietly distorts
Safe-to-Spend for every month afterwards, which is much harder to notice than a
single wrong expense.

Each row can be removed, so a plan that got three things right and one wrong is
still useful.
*/
export function ActionPlan({
  actions,
  applying,
  error,
  onApply,
  onDiscard,
  onRemove,
}: {
  actions: NormalisedAction[]
  applying: boolean
  error: string | null
  onApply: () => void
  onDiscard: () => void
  onRemove: (index: number) => void
}) {
  const [expanded, setExpanded] = useState(true)

  if (actions.length === 0) return null

  return (
    <div className="rounded-card border border-line border-l-4 border-l-primary bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 font-extrabold text-primary-dark">
          {actions.length === 1 ? 'One change to make' : `${actions.length} changes to make`}
        </p>
        <button
          type="button"
          className="text-sm font-bold text-muted hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {expanded && (
        <ol className="m-0 mt-3 grid list-none gap-2 p-0">
          {actions.map((action, index) => (
            <li
              key={`${action.kind}-${index}`}
              className="flex items-start justify-between gap-3 rounded-field bg-primary-soft px-3 py-2"
            >
              <span className="text-ink">{describe(action)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label="Remove this change"
                title="Remove"
                className="shrink-0 font-bold text-muted transition hover:text-danger"
              >
                &times;
              </button>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="mt-3 mb-0 text-sm font-bold text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} disabled={applying} onClick={onApply}>
          {applying ? 'Applying…' : actions.length === 1 ? 'Apply change' : 'Apply all'}
        </button>
        <button type="button" className={linkButton} onClick={onDiscard} disabled={applying}>
          Discard
        </button>
      </div>
    </div>
  )
}
