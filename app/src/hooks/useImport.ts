import { useCallback, useState } from 'react'
import { collection, doc, writeBatch, type WriteBatch } from 'firebase/firestore'

import { checkDuplicate, slugify } from '../lib/categories'
import { db, userPath } from '../lib/firebase'
import { movementFor, planImport, type ImportRow } from '../lib/importCsv'
import type { Category, Track, Transaction } from '../lib/types'

/*
Writes an import, and can take it back.

Same write path as everything else - the user's own client, through the
security rules - so an imported row is held to exactly the rules a typed one
is. Ids for new tracks are minted client-side first, as the plan executor does,
so a row can point at a track created by this same import.

Firestore batches cap at 500 operations. Tracks and categories go in the first
batch with the opening rows, so no row is ever written before the track it
belongs to exists.

Imported rows carry source 'import'. That is what makes Undo possible: it
soft-deletes exactly those rows and nothing typed by hand, and the rules keep
them recoverable because nothing in the ledger is ever hard-deleted.
*/

const OPS_PER_BATCH = 450

export interface ImportResult {
  rowsWritten: number
  tracksCreated: number
  categoriesCreated: number
}

export function useImport(uid: string, tracks: Track[], categories: Category[], transactions: Transaction[]) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const imported = transactions.filter((t) => t.source === 'import' && !t.deletedAt)

  const run = useCallback(async (rows: ImportRow[]): Promise<ImportResult | null> => {
    if (rows.length === 0 || busy) return null
    setBusy(true)
    setError(null)

    try {
      const plan = planImport(rows, tracks, categories)
      const batches: WriteBatch[] = [writeBatch(db)]
      let ops = 0
      const next = () => {
        if (++ops % OPS_PER_BATCH === 0) batches.push(writeBatch(db))
        return batches[batches.length - 1]
      }

      const trackIds = new Map(tracks.filter((t) => !t.archived).map((t) => [t.name.toLowerCase(), t.id]))
      for (const track of plan.newTracks) {
        const ref = doc(collection(db, userPath(uid, 'tracks')))
        trackIds.set(track.name.toLowerCase(), ref.id)
        next().set(ref, {
          name: track.name,
          type: track.type,
          archived: false,
          createdAt: Date.now(),
          ...(track.type === 'goal' ? { targetMinor: 0 } : {}),
        })
      }

      for (const name of plan.newCategories) {
        next().set(doc(collection(db, userPath(uid, 'categories'))), {
          name,
          slug: slugify(name),
          archived: false,
          createdFrom: 'manual',
          createdAt: Date.now(),
        })
      }

      // Use an existing category's own spelling, so "food" lands in "Food".
      const spelling = (name: string) => checkDuplicate(name, categories).exact?.name ?? name

      for (const row of rows) {
        const trackId = trackIds.get(row.trackName.toLowerCase())
        if (!trackId) throw new Error(`No track for line ${row.line}.`)
        const movement = movementFor(row.type)
        next().set(doc(collection(db, userPath(uid, 'transactions'))), {
          occurredOn: row.occurredOn,
          amountMinor: row.amountMinor,
          movement,
          trackId,
          // A savings contribution credits its goal, as a typed one would.
          ...(movement === 'transfer' ? { toTrackId: trackId } : {}),
          categoryName: spelling(row.categoryName),
          description: row.description,
          paymentMethod: 'upi',
          source: 'import',
          createdAt: Date.now(),
          deletedAt: null,
        } satisfies Omit<Transaction, 'id'>)
      }

      // In order: the first batch holds the tracks every later row points at.
      for (const batch of batches) await batch.commit()

      return {
        rowsWritten: rows.length,
        tracksCreated: plan.newTracks.length,
        categoriesCreated: plan.newCategories.length,
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import did not finish.')
      return null
    } finally {
      setBusy(false)
    }
  }, [busy, uid, tracks, categories])

  /** Soft-delete every imported row. Tracks and categories it created stay, and can be removed on Home. */
  const undo = useCallback(async (): Promise<number> => {
    if (imported.length === 0 || busy) return 0
    setBusy(true)
    setError(null)
    try {
      const now = Date.now()
      for (let i = 0; i < imported.length; i += OPS_PER_BATCH) {
        const batch = writeBatch(db)
        for (const t of imported.slice(i, i + OPS_PER_BATCH)) {
          batch.update(doc(db, userPath(uid, 'transactions'), t.id), { deletedAt: now })
        }
        await batch.commit()
      }
      return imported.length
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the imported entries.')
      return 0
    } finally {
      setBusy(false)
    }
  }, [busy, imported, uid])

  return { run, undo, busy, error, importedCount: imported.length }
}
