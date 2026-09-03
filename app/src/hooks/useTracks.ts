import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
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
        setTracks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Track))
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

  async function archiveTrack(uid: string, id: string) {
    // Archived rather than deleted: it disappears from pickers but its history stays intact.
    await updateDoc(doc(db, userPath(uid, 'tracks'), id), { archived: true })
  }

  const active = tracks.filter((t) => !t.archived)

  return { tracks, active, loading, createTrack, updateTrack, archiveTrack }
}
