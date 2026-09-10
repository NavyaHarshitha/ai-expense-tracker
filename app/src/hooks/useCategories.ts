import { useEffect, useRef, useState } from 'react'
import {
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
import { sanitiseAll, toCategory } from '../lib/sanitize'
import { STARTER_CATEGORIES, slugify } from '../lib/categories'
import type { Category } from '../lib/types'

/** Firestore caps a batch at 500 writes, so a rename over a long ledger chunks. */
const BATCH_LIMIT = 450

export function useCategories(uid: string | undefined, seeded: boolean | undefined) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const seedingRef = useRef(false)

  useEffect(() => {
    if (!uid) {
      setCategories([])
      setLoading(false)
      return
    }

    return onSnapshot(
      collection(db, userPath(uid, 'categories')),
      (snap) => {
        setCategories(sanitiseAll(snap.docs, toCategory))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  /*
  Create the starter set once, on a genuinely new account.

  Gated on a profile flag rather than "is the list empty", because deleting
  every category deliberately would otherwise look identical to a fresh account
  and the defaults would keep coming back.
  */
  useEffect(() => {
    if (!uid || loading || seeded !== false || seedingRef.current) return

    seedingRef.current = true
    const batch = writeBatch(db)
    const col = collection(db, userPath(uid, 'categories'))

    for (const name of STARTER_CATEGORIES) {
      batch.set(doc(col), {
        name,
        slug: slugify(name),
        archived: false,
        createdFrom: 'seed',
        createdAt: Date.now(),
      })
    }

    batch.set(
      doc(db, userPath(uid, 'settings'), 'profile'),
      { categoriesSeededAt: Date.now() },
      { merge: true },
    )

    batch.commit().catch(() => {
      seedingRef.current = false
    })
  }, [uid, loading, seeded])

  async function createCategory(
    uid: string,
    name: string,
    createdFrom: Category['createdFrom'] = 'manual',
  ) {
    const batch = writeBatch(db)
    batch.set(doc(collection(db, userPath(uid, 'categories'))), {
      name: name.trim(),
      slug: slugify(name),
      archived: false,
      createdFrom,
      createdAt: Date.now(),
    })
    await batch.commit()
  }

  /**
   * Rename a category AND every transaction carrying the old name.
   *
   * Transactions store categoryName rather than a reference, which keeps
   * filtering and grouping cheap - but it means a rename has to be carried
   * through history, or old rows sit under a category that no longer exists in
   * any dropdown. Chunked, because a batch holds 500 writes.
   */
  async function renameCategory(uid: string, category: Category, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === category.name) return { rowsUpdated: 0 }

    await updateDoc(doc(db, userPath(uid, 'categories'), category.id), {
      name: trimmed,
      slug: slugify(trimmed),
    })

    const affected = await getDocs(
      query(
        collection(db, userPath(uid, 'transactions')),
        where('categoryName', '==', category.name),
      ),
    )

    let rowsUpdated = 0

    for (let i = 0; i < affected.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db)
      for (const d of affected.docs.slice(i, i + BATCH_LIMIT)) {
        batch.update(d.ref, { categoryName: trimmed })
        rowsUpdated++
      }
      await batch.commit()
    }

    return { rowsUpdated }
  }

  /**
   * Archive rather than delete.
   *
   * Past transactions keep the name they were filed under, so history stays
   * truthful; the category simply stops being offered for new entries.
   */
  async function archiveCategory(uid: string, id: string) {
    await updateDoc(doc(db, userPath(uid, 'categories'), id), { archived: true })
  }

  /*
  Hard delete, and safe to offer without reassignment.

  Transactions cite a category by NAME rather than by id, so removing the
  document leaves every historical row reading exactly as it did. This is the
  one archive where deleting cannot orphan anything.
  */
  async function deleteCategory(uid: string, id: string) {
    await deleteDoc(doc(db, userPath(uid, 'categories'), id))
  }

  async function restoreCategory(uid: string, id: string) {
    await updateDoc(doc(db, userPath(uid, 'categories'), id), { archived: false })
  }

  const active = categories.filter((c) => !c.archived)

  return {
    categories,
    active,
    loading,
    createCategory,
    renameCategory,
    archiveCategory,
    restoreCategory,
    deleteCategory,
  }
}
