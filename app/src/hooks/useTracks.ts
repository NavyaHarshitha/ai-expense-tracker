import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
import { sanitiseAll, toTrack } from '../lib/sanitize'
import type { Track } from '../lib/types'

export function useTracks(uid: string | undefined) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setTracks([])
      setLoading(false)
      return
    }

    // onSnapshot is the reactive layer - no polling, no refetching, and it
    // serves from the offline cache first when there's no connection.
    return onSnapshot(
      collection(db, userPath(uid, 'tracks')),
      (snap) => {
        setTracks(sanitiseAll(snap.docs, toTrack))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  async function createTrack(uid: string, track: Omit<Track, 'id'>) {
    await addDoc(collection(db, userPath(uid, 'tracks')), {
      ...track,
      createdAt: Date.now(),
    })
  }

  /**
   * Patch a track.
   *
   * Fields that don't apply to the type are written as null rather than left
   * stale: switching a goal to a spending track must clear the old target, or
   * Safe-to-Spend keeps reserving savings for a track that no longer has any.
   */
  async function updateTrack(uid: string, id: string, patch: Partial<Track>) {
    await updateDoc(doc(db, userPath(uid, 'tracks'), id), patch)
  }

  /**
   * Hard delete, for a track created by mistake.
   *
   * Only safe when nothing references it. A track with history must be archived
   * instead, or its transactions point at an id that no longer resolves and the
   * ledger starts showing "Unassigned" rows with no explanation. The caller
   * decides which, based on usage.
   */
  async function deleteTrack(uid: string, id: string) {
    await deleteDoc(doc(db, userPath(uid, 'tracks'), id))
  }

  /**
   * Move every transaction off a track, then delete it.
   *
   * This is what makes deleting a used track safe rather than forbidden. The
   * rows are reassigned first, so nothing is left pointing at an id that no
   * longer resolves - which would surface as "Unassigned" entries with no
   * explanation. Chunked, since a batch holds 500 writes.
   */
  async function reassignAndDeleteTrack(uid: string, id: string, toTrackId: string) {
    if (id === toTrackId) return { rowsMoved: 0 }

    const affected = await getDocs(
      query(collection(db, userPath(uid, 'transactions')), where('trackId', '==', id)),
    )

    let rowsMoved = 0

    for (let i = 0; i < affected.docs.length; i += 450) {
      const batch = writeBatch(db)
      for (const d of affected.docs.slice(i, i + 450)) {
        batch.update(d.ref, { trackId: toTrackId, updatedAt: Date.now() })
        rowsMoved++
      }
      await batch.commit()
    }

    // Only once nothing references it any more.
    await deleteDoc(doc(db, userPath(uid, 'tracks'), id))

    return { rowsMoved }
  }

  async function archiveTrack(uid: string, id: string) {
    // Archived rather than deleted: it disappears from pickers but its history stays intact.
    await updateDoc(doc(db, userPath(uid, 'tracks'), id), { archived: true })
  }

  const active = tracks.filter((t) => !t.archived)

  return {
    tracks,
    active,
    loading,
    createTrack,
    updateTrack,
    archiveTrack,
    deleteTrack,
    reassignAndDeleteTrack,
  }
}
