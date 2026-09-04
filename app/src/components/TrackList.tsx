import { useState } from 'react'

import { trackHoldingMinor } from '../lib/balance'
import { formatINR } from '../lib/money'
import { isInMonth } from '../lib/safeToSpend'
import { TRACK_TYPE_LABELS, type Track, type TrackType, type Transaction } from '../lib/types'
import { card } from '../lib/ui'

const ORDER: TrackType[] = ['spending', 'commitment', 'goal', 'project']

const iconButton =
  'inline-flex h-6 w-7 shrink-0 items-center justify-center rounded border border-line-strong bg-surface text-muted transition hover:border-ink hover:text-ink'

/*
Remove, with a two-step confirm and the right verb for the situation.

A track nothing references is deleted outright - it was a mistake, and archiving
mistakes just fills the archive. A track with history is archived instead: its
transactions point at this id, and deleting it would leave the ledger showing
"Unassigned" rows with no explanation of why.
*/
function RemoveTrackButton({
  track,
  usedBy,
  onRemove,
}: {
  track: Track
  usedBy: number
  onRemove: (track: Track, hasHistory: boolean) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const hasHistory = usedBy > 0

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`${hasHistory ? 'Archive' : 'Delete'} ${track.name}`}
        title={hasHistory ? 'Archive track' : 'Delete track'}
        className={iconButton}
      >
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
          <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
        </svg>
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await onRemove(track, hasHistory)
        }}
        className="rounded border border-danger px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-danger transition hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? '…' : hasHistory ? 'Archive' : 'Delete'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded px-2 py-0.5 text-xs font-bold text-muted hover:underline"
      >
        No
      </button>
    </span>
  )
}

/** What each track type measures progress against - they are not the same question. */
function progressFor(track: Track, transactions: Transaction[], today: Date) {
  const mine = transactions.filter((t) => t.trackId === track.id && !t.deletedAt)

  const netOf = (rows: Transaction[]) =>
    rows.reduce((s, t) => {
      if (t.movement === 'expense') return s + t.amountMinor
      if (t.movement === 'refund') return s - t.amountMinor
      if (t.movement === 'transfer' && t.toTrackId === track.id) return s + t.amountMinor
      return s
    }, 0)

  switch (track.type) {
    case 'spending': {
      const used = netOf(mine.filter((t) => isInMonth(t.occurredOn, today)))
      return { used, total: track.monthlyLimitMinor ?? 0, caption: 'spent this month' }
    }
    case 'commitment': {
      // Has this month's commitment actually been paid? Previously hardcoded to 0,
      // which meant the bar could never answer the only question it exists to answer.
      const paid = netOf(mine.filter((t) => isInMonth(t.occurredOn, today)))
      const due = track.commitmentAmountMinor ?? 0
      return {
        used: paid,
        total: due,
        caption: paid >= due && due > 0 ? 'paid this month' : `due on the ${track.dueDay ?? '-'}`,
      }
    }
    case 'goal': {
      // Opening balance included, so money held before tracking began counts.
      const held = trackHoldingMinor(track, transactions)
      const opening = track.openingBalanceMinor ?? 0
      return {
        used: held,
        total: track.targetMinor ?? 0,
        caption: opening > 0 ? `includes ${formatINR(opening)} you already had` : 'saved so far',
      }
    }
    case 'project': {
      const held = trackHoldingMinor(track, transactions)
      return {
        used: held,
        total: track.budgetMinor ?? track.targetMinor ?? 0,
        caption: track.phase === 'active' ? 'spending down' : 'building the fund',
      }
    }
  }
}

export function TrackList({
  tracks,
  transactions,
  today,
  only,
  editingId,
  onEdit,
  onRemove,
}: {
  tracks: Track[]
  transactions: Transaction[]
  today: Date
  /** Render just one type - lets Home show commitments and tracks separately. */
  only?: TrackType[]
  editingId?: string | null
  onEdit?: (track: Track) => void
  /** Removes the track. Delete when nothing references it, archive otherwise. */
  onRemove?: (track: Track, hasHistory: boolean) => Promise<void>
}) {
  const types = only ?? ORDER

  if (tracks.filter((t) => types.includes(t.type)).length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line-strong p-8 text-center">
        <p className="m-0 text-muted">
          Nothing here yet. Add a track below, or seed demo data to see how it works.
        </p>
      </div>
    )
  }

  return (
    <>
      {types.map((type) => {
        /*
        Commitments read as a calendar, so they are ordered by the day they fall
        due rather than by creation order - which is what you actually want to
        scan when working out what is still coming this month.
        */
        const group = tracks
          .filter((t) => t.type === type)
          .sort((a, b) =>
            type === 'commitment'
              ? (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.name.localeCompare(b.name)
              : a.name.localeCompare(b.name),
          )
        if (group.length === 0) return null

        return (
          <div className="mb-6" key={type}>
            {!only && (
              <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-muted">
                {TRACK_TYPE_LABELS[type]}
              </h3>
            )}

            <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
              {group.map((track) => {
                const { used, total, caption } = progressFor(track, transactions, today)
                const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
                const over = total > 0 && used > total

                return (
                  <li
                    className={`${card} p-5 ${
                      editingId === track.id ? 'border-l-4 border-l-primary' : ''
                    }`}
                    key={track.id}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-extrabold text-ink">
                        {track.name}
                        {track.raidable === false && (
                          <span className="ml-2 rounded-full bg-lavender px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-primary-dark">
                            Locked
                          </span>
                        )}
                      </span>

                      <span className="flex items-baseline gap-2">
                        <span className="tnum whitespace-nowrap font-bold text-muted">
                          {formatINR(used)}
                          {total > 0 && <> / {formatINR(total)}</>}
                        </span>

                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(track)}
                            aria-label={`Edit ${track.name}`}
                            title="Edit track"
                            className={iconButton}
                          >
                            <svg
                              className="h-3.5 w-3.5 fill-current"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z" />
                              <path d="M19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05Z" />
                            </svg>
                          </button>
                        )}

                        {onRemove && (
                          <RemoveTrackButton
                            track={track}
                            usedBy={transactions.filter(
                              (t) => t.trackId === track.id && !t.deletedAt,
                            ).length}
                            onRemove={onRemove}
                          />
                        )}
                      </span>
                    </div>

                    {total > 0 && (
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-lavender"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${track.name} progress`}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            over ? 'bg-danger' : 'bg-primary'
                          }`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    )}

                    <p className="m-0 mt-2 text-sm text-muted">{caption}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}
