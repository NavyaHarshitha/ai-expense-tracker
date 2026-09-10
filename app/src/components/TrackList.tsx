import { useState } from 'react'

import { trackHoldingMinor } from '../lib/balance'
import { formatINR } from '../lib/money'
import { isInMonth } from '../lib/safeToSpend'
import { TRACK_TYPE_LABELS, type Track, type TrackType, type Transaction } from '../lib/types'

/*
Tracks render as a dense list, not a grid of cards.

The card grid gave every track a whole block for four short facts, so seven
commitments filled a screen and a half, a long fund name dragged its entire row
taller, and an odd count left a hole. None of that is information.

A list fixes all three, and for commitments it is also the truer shape: they are
a schedule. Sorted by due day with the day itself as a leading chip, the column
of numbers down the left edge reads as a calendar - which is the question you
actually bring to this section, "what is still coming this month".

Progress is a tint filling the row from the left rather than a separate bar
beneath the text. It costs no vertical space, and at a glance the amount of
colour across the list IS the answer.
*/

const ORDER: TrackType[] = ['spending', 'commitment', 'goal', 'project']

const iconButton =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-60 transition hover:bg-canvas hover:text-ink focus-visible:opacity-100 group-hover:opacity-100'

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

/** The day a commitment falls due, as a calendar chip. */
function DayChip({ day, done }: { day?: number; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`tnum flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border text-[13px] font-extrabold leading-none ${
        done
          ? 'border-transparent bg-good-soft text-good'
          : 'border-line-strong bg-canvas text-ink-soft'
      }`}
    >
      {done ? (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      ) : (
        day ?? '–'
      )}
    </span>
  )
}

/*
Remove, with the choice the situation actually presents.

A track nothing references is deleted outright - it was a mistake, and archiving
mistakes just fills the archive. A track WITH history offers both: archive it
(history intact, hidden from pickers), or move its entries somewhere else and
delete it. Blocking delete outright was the wrong answer - a track can be a
mistake and still have a stray row on it, which is exactly what happens when
income lands on the only spending track.

The count is shown either way. "You cannot delete this" with no reason given is
the thing that makes an app feel broken.
*/
function RemoveTrackButton({
  track,
  usedBy,
  moveTargets,
  onRemove,
  onReassignAndDelete,
  confirming,
  setConfirming,
}: {
  track: Track
  usedBy: number
  /** Other live tracks the entries could move to. */
  moveTargets: Track[]
  onRemove: (track: Track, hasHistory: boolean) => Promise<void>
  onReassignAndDelete?: (track: Track, toTrackId: string) => Promise<void>
  confirming: boolean
  setConfirming: (v: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [moveTo, setMoveTo] = useState(moveTargets[0]?.id ?? '')

  const hasHistory = usedBy > 0

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${track.name}`}
        title={hasHistory ? `Archive or delete (${usedBy} entries)` : 'Delete track'}
        className={iconButton}
      >
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
          <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
        </svg>
      </button>
    )
  }

  // Nothing points at it - a plain delete is safe.
  if (!hasHistory) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onRemove(track, false)
          }}
          className="rounded-md border border-danger px-2 py-1 text-xs font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger-soft disabled:opacity-50"
        >
          {busy ? '…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-xs font-bold text-muted hover:underline"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <span className="grid w-full gap-2 rounded-field border border-line-strong bg-canvas p-3 text-left">
      <span className="text-sm text-ink">
        <strong className="tnum">{usedBy}</strong> entr{usedBy === 1 ? 'y' : 'ies'} use this
        track.
      </span>

      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onRemove(track, true)
          }}
          className="rounded-md border border-line-strong px-2 py-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft transition hover:border-ink disabled:opacity-50"
        >
          Archive
        </button>
        <span className="text-xs text-muted">keeps history, hides the track</span>
      </span>

      {onReassignAndDelete && moveTargets.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !moveTo}
            onClick={async () => {
              setBusy(true)
              await onReassignAndDelete(track, moveTo)
            }}
            className="rounded-md border border-danger px-2 py-1 text-xs font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger-soft disabled:opacity-50"
          >
            {busy ? '…' : 'Move & delete'}
          </button>
          <span className="text-xs text-muted">move them to</span>
          <select
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            aria-label="Move entries to"
            className="rounded-md border border-line-strong bg-surface px-2 py-1 text-xs"
          >
            {moveTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </span>
      )}

      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="justify-self-start rounded-md px-2 py-1 text-xs font-bold text-muted hover:underline"
      >
        Cancel
      </button>
    </span>
  )
}

function TrackRow({
  track,
  transactions,
  tracks,
  today,
  paydayDay,
  editing,
  onEdit,
  onRemove,
  onReassignAndDelete,
}: {
  track: Track
  transactions: Transaction[]
  tracks: Track[]
  today: Date
  paydayDay?: number
  editing: boolean
  onEdit?: (track: Track) => void
  onRemove?: (track: Track, hasHistory: boolean) => Promise<void>
  onReassignAndDelete?: (track: Track, toTrackId: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  const { used, total, caption } = progressFor(track, transactions, today)
  const isCommitment = track.type === 'commitment'
  const settled = isCommitment && total > 0 && used >= total

  const heldEarly =
    isCommitment &&
    paydayDay !== undefined &&
    track.dueDay !== undefined &&
    track.dueDay < paydayDay

  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 100))) : 0
  const over = total > 0 && used > total && !isCommitment

  const usedBy = transactions.filter((t) => t.trackId === track.id && !t.deletedAt).length

  return (
    <li
      /*
      Editing is marked with an accent edge, not a background wash: the wash was
      the same colour as a completed progress fill, so a row being edited and a
      row that was fully paid looked identical.
      */
      className={`group relative overflow-hidden border-b border-line last:border-b-0 transition-colors ${
        editing ? 'bg-canvas ring-1 ring-inset ring-primary' : 'hover:bg-canvas/70'
      }`}
    >
      {/*
      Progress as a tint filling the row, so it reads at a glance without
      claiming a line of its own. aria-hidden because the figures beside it
      already state the same thing in words.
      */}
      {total > 0 && pct > 0 && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 ${
            over ? 'bg-danger-soft' : settled ? 'bg-row-paid' : 'bg-row-progress'
          }`}
          style={{
            width: `${pct}%`,
            /*
            Fade the trailing edge out.

            A flat fill stops dead in the middle of the row, and a hard vertical
            edge behind text reads as a rendering fault rather than as a meter.
            Feathering the last stretch makes it obviously a fill. A completed
            row is not faded - it is meant to look wholly done.
            */
            ...(pct < 100
              ? {
                  // Proportional, not a fixed distance: a 30% fill and a 90%
                  // fill then feather at the same visual rate.
                  maskImage: 'linear-gradient(to right, #000 55%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to right, #000 55%, transparent 100%)',
                }
              : {}),
          }}
        />
      )}

      {editing && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary"
        />
      )}

      <div className="relative flex items-center gap-3 px-3 py-2.5 sm:px-4">
        {isCommitment && <DayChip day={track.dueDay} done={settled} />}

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`truncate font-bold ${settled ? 'text-muted' : 'text-ink'}`}
              title={track.name}
            >
              {track.name}
            </span>

            {track.raidable === false && (
              <span className="rounded-full bg-lavender px-2 py-px text-[10px] font-extrabold uppercase tracking-wide text-primary-dark">
                Locked
              </span>
            )}
            {heldEarly && (
              <span className="rounded-full bg-primary-soft px-2 py-px text-[10px] font-extrabold uppercase tracking-wide text-primary-dark">
                Held early
              </span>
            )}
          </span>

          {/* The caption is the row's secondary line only where it says something
              the chip and amount do not already say. */}
          {(!isCommitment || settled) && (
            <span className="mt-0.5 block truncate text-xs text-muted">{caption}</span>
          )}
        </span>

        <span
          className={`tnum shrink-0 whitespace-nowrap text-right text-sm font-bold ${
            over ? 'text-danger' : settled ? 'text-muted' : 'text-ink'
          }`}
        >
          {isCommitment && !settled ? (
            formatINR(total)
          ) : (
            <>
              {formatINR(used)}
              {total > 0 && <span className="font-medium text-muted"> / {formatINR(total)}</span>}
            </>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-0.5">
          {onEdit && !confirming && (
            <button
              type="button"
              onClick={() => onEdit(track)}
              aria-label={`Edit ${track.name}`}
              title="Edit track"
              className={iconButton}
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z" />
                <path d="M19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05Z" />
              </svg>
            </button>
          )}

          {onRemove && (!confirming || usedBy === 0) && (
            <RemoveTrackButton
              track={track}
              usedBy={usedBy}
              moveTargets={tracks.filter((t) => !t.archived && t.id !== track.id)}
              onRemove={onRemove}
              onReassignAndDelete={onReassignAndDelete}
              confirming={confirming}
              setConfirming={setConfirming}
            />
          )}
        </span>
      </div>

      {/* The archive-or-reassign choice needs room, so it drops below the row
          rather than squeezing the controls out of alignment. */}
      {onRemove && confirming && usedBy > 0 && (
        <div className="relative px-3 pb-3 sm:px-4">
          <RemoveTrackButton
            track={track}
            usedBy={usedBy}
            moveTargets={tracks.filter((t) => !t.archived && t.id !== track.id)}
            onRemove={onRemove}
            onReassignAndDelete={onReassignAndDelete}
            confirming
            setConfirming={setConfirming}
          />
        </div>
      )}
    </li>
  )
}

export function TrackList({
  tracks,
  transactions,
  today,
  only,
  paydayDay,
  editingId,
  onEdit,
  onRemove,
  onReassignAndDelete,
}: {
  tracks: Track[]
  transactions: Transaction[]
  today: Date
  /** Day the salary lands, so a pre-payday commitment can say so. */
  paydayDay?: number
  /** Render just one type - lets Home show commitments and tracks separately. */
  only?: TrackType[]
  editingId?: string | null
  onEdit?: (track: Track) => void
  /** Removes the track. Delete when nothing references it, archive otherwise. */
  onRemove?: (track: Track, hasHistory: boolean) => Promise<void>
  onReassignAndDelete?: (track: Track, toTrackId: string) => Promise<void>
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

        /*
        A running total for the group, because the question "how much of this is
        already dealt with" was previously only answerable by reading every card
        and adding up.
        */
        const totals = group.reduce(
          (acc, t) => {
            const { used, total } = progressFor(t, transactions, today)
            acc.total += total
            acc.done += Math.min(used, total)
            return acc
          },
          { total: 0, done: 0 },
        )
        const outstanding = Math.max(0, totals.total - totals.done)

        return (
          <div className="mb-6" key={type}>
            {!only && (
              <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">
                {TRACK_TYPE_LABELS[type]}
              </h3>
            )}

            {totals.total > 0 && (
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="text-muted">
                  {group.length} {group.length === 1 ? 'track' : 'tracks'}
                  {type === 'commitment' && (
                    <>
                      {' · '}
                      <strong className="tnum text-ink">{formatINR(outstanding)}</strong> still due
                    </>
                  )}
                </span>
                <span className="tnum text-muted">
                  <strong className="text-ink">{formatINR(totals.done)}</strong> of{' '}
                  {formatINR(totals.total)}
                </span>
              </div>
            )}

            <ul className="list-none overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
              {group.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  tracks={tracks}
                  transactions={transactions}
                  today={today}
                  paydayDay={paydayDay}
                  editing={editingId === track.id}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onReassignAndDelete={onReassignAndDelete}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}
