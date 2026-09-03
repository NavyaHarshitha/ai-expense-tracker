import { useCallback, useState } from 'react'
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
import type { NormalisedAction } from '../lib/planActions'
import type { Track, Transaction } from '../lib/types'

/*
Applies a confirmed plan.

Two things matter here for scale and correctness:

1. Structural changes go in ONE writeBatch, not N sequential awaits. Three
   tracks become one round trip and one atomic commit - either all three exist
   or none do, so a dropped connection can't leave you with two of the three
   SIPs you just described. Firestore batches cap at 500 operations; the planner
   caps at 20, so we are comfortably inside.

2. Ids for new tracks are minted client-side BEFORE committing, which is what
   makes forward references work: an expense in the same utterance can be
   assigned to a track created by that same utterance.
*/

export interface ApplyResult {
  tracksCreated: number
  tracksUpdated: number
  incomeSet: boolean
  expenseIds: string[]
}

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function usePlanExecutor(
  uid: string,
  tracks: Track[],
  createTransaction: (uid: string, txn: Omit<Transaction, 'id'>) => Promise<string>,
) {
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback(
    async (actions: NormalisedAction[]): Promise<ApplyResult | null> => {
      if (actions.length === 0 || applying) return null

      setApplying(true)
      setError(null)

      const result: ApplyResult = {
        tracksCreated: 0,
        tracksUpdated: 0,
        incomeSet: false,
        expenseIds: [],
      }

      try {
        const batch = writeBatch(db)
        const tracksCol = collection(db, userPath(uid, 'tracks'))

        // name (lowercased) -> id, for resolving expenses against tracks that
        // are being created in this same plan.
        const newTrackIds = new Map<string, string>()

        for (const action of actions) {
          if (action.kind === 'create_track') {
            // doc() with no id mints one locally without touching the network.
            const ref = doc(tracksCol)
            newTrackIds.set(action.name.toLowerCase(), ref.id)

            batch.set(ref, {
              name: action.name,
              type: action.type,
              archived: false,
              createdAt: Date.now(),
              ...(action.type === 'spending' && action.amountMinor !== undefined
                ? { monthlyLimitMinor: action.amountMinor }
                : {}),
              ...(action.type === 'commitment'
                ? {
                    commitmentAmountMinor: action.amountMinor ?? 0,
                    dueDay: action.dueDay ?? 1,
                  }
                : {}),
              ...(action.type === 'goal'
                ? {
                    targetMinor: action.amountMinor ?? 0,
                    ...(action.perMonthMinor !== undefined
                      ? { plannedMonthlyMinor: action.perMonthMinor }
                      : {}),
                    ...(action.locked ? { raidable: false } : {}),
                  }
                : {}),
              ...(action.type === 'project'
                ? {
                    budgetMinor: action.amountMinor ?? 0,
                    phase: 'accumulating',
                    ...(action.perMonthMinor !== undefined
                      ? { plannedMonthlyMinor: action.perMonthMinor }
                      : {}),
                  }
                : {}),
            })

            result.tracksCreated += 1
          }

          if (action.kind === 'update_track') {
            const patch: Record<string, unknown> = {}
            if (action.newName) patch.name = action.newName
            if (action.dueDay !== undefined) patch.dueDay = action.dueDay
            if (action.perMonthMinor !== undefined) patch.plannedMonthlyMinor = action.perMonthMinor
            if (action.locked !== undefined) patch.raidable = !action.locked

            if (action.amountMinor !== undefined) {
              // Which field the amount lands in depends on the track's type.
              const existing = tracks.find((t) => t.id === action.trackId)
              const key =
                existing?.type === 'commitment'
                  ? 'commitmentAmountMinor'
                  : existing?.type === 'goal'
                    ? 'targetMinor'
                    : existing?.type === 'project'
                      ? 'budgetMinor'
                      : 'monthlyLimitMinor'
              patch[key] = action.amountMinor
            }

            if (Object.keys(patch).length > 0) {
              batch.update(doc(db, userPath(uid, 'tracks'), action.trackId), patch)
              result.tracksUpdated += 1
            }
          }

          if (action.kind === 'set_income') {
            batch.set(
              doc(db, userPath(uid, 'settings'), 'profile'),
              { monthlyIncomeMinor: action.amountMinor },
              { merge: true },
            )
            result.incomeSet = true
          }
        }

        // One network round trip, atomic.
        await batch.commit()

        /*
        Expenses are written individually rather than batched, deliberately:
        createTransaction returns the new id, which is what makes Undo able to
        remove exactly the row it created. There are at most a handful per
        utterance, so the extra round trips cost nothing.
        */
        /*
        Resolution order matters: a track created by this same plan wins, then an
        existing track by name, then a sensible default.

        The last fallback includes tracks created moments ago in this batch -
        without it, the very first thing a new user says ("spent 250 on lunch")
        would create a track and then fail to attach the expense to it.
        */
        const firstNewTrackId = [...newTrackIds.values()][0]
        const fallbackId =
          tracks.find((t) => t.type === 'spending')?.id ?? tracks[0]?.id ?? firstNewTrackId

        for (const action of actions) {
          if (action.kind !== 'create_expense') continue

          const wanted = action.trackName?.toLowerCase()
          const trackId =
            (wanted && newTrackIds.get(wanted)) ||
            (wanted && tracks.find((t) => t.name.toLowerCase() === wanted)?.id) ||
            fallbackId

          if (!trackId) {
            console.warn('Skipped an expense with no track to attach it to')
            continue
          }

          const id = await createTransaction(uid, {
            occurredOn: action.occurredOn ?? todayIso(),
            amountMinor: action.amountMinor,
            movement: action.movement,
            trackId,
            categoryName: action.category,
            description: action.description,
            ...(action.note ? { note: action.note } : {}),
            paymentMethod: action.paymentMethod,
            source: 'voice',
            createdAt: Date.now(),
            deletedAt: null,
          })

          result.expenseIds.push(id)
        }

        return result
      } catch (e) {
        // The batch is atomic, so a failure here means nothing structural was
        // written - safe to just tell the user and let them retry.
        setError(e instanceof Error ? e.message : 'Could not apply those changes.')
        return null
      } finally {
        setApplying(false)
      }
    },
    [applying, createTransaction, tracks, uid],
  )

  return { apply, applying, error, clearError: () => setError(null) }
}
