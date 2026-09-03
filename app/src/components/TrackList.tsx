import { formatINR } from '../lib/money'
import { isInMonth } from '../lib/safeToSpend'
import { TRACK_TYPE_LABELS, type Track, type TrackType, type Transaction } from '../lib/types'
import { card } from '../lib/ui'

const ORDER: TrackType[] = ['spending', 'commitment', 'goal', 'project']

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
    case 'goal':
      return { used: netOf(mine), total: track.targetMinor ?? 0, caption: 'saved so far' }
    case 'project':
      return {
        used: netOf(mine),
        total: track.budgetMinor ?? track.targetMinor ?? 0,
        caption: track.phase === 'active' ? 'spending down' : 'building the fund',
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
}: {
  tracks: Track[]
  transactions: Transaction[]
  today: Date
  /** Render just one type - lets Home show commitments and tracks separately. */
  only?: TrackType[]
  editingId?: string | null
  onEdit?: (track: Track) => void
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
        const group = tracks.filter((t) => t.type === type)
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
                            className="inline-flex h-6 w-7 shrink-0 items-center justify-center rounded border border-line-strong bg-surface text-muted transition hover:border-ink hover:text-ink"
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
