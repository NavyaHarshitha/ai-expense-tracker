import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
import type { Transaction } from '../lib/types'

export function useTransactions(uid: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setTransactions([])
      setLoading(false)
      return
    }

    /*
    Ordered by date only - a single-field orderBy needs no composite index.
    Soft-deleted rows are filtered client side rather than with a where()
    clause, which would require one. At personal-ledger scale (hundreds of
    rows, not millions) that's the right trade; revisit if it ever isn't.
    */
    const q = query(collection(db, userPath(uid, 'transactions')), orderBy('occurredOn', 'desc'))

    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Transaction)
          .filter((t) => !t.deletedAt)
        setTransactions(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  async function createTransaction(uid: string, txn: Omit<Transaction, 'id'>) {
    await addDoc(collection(db, userPath(uid, 'transactions')), txn)
  }

  /**
   * Patch an existing row.
   *
   * Takes a partial rather than the whole document so createdAt, source and
   * deletedAt survive an edit - editing an amount shouldn't rewrite the
   * provenance of how the expense was captured.
   */
  async function updateTransaction(uid: string, id: string, patch: Partial<Transaction>) {
    await updateDoc(doc(db, userPath(uid, 'transactions'), id), {
      ...patch,
      updatedAt: Date.now(),
    })
  }

  async function softDelete(uid: string, id: string) {
    // Financial records are corrected by appending, never destroyed.
    await updateDoc(doc(db, userPath(uid, 'transactions'), id), { deletedAt: Date.now() })
  }

  return { transactions, loading, createTransaction, updateTransaction, softDelete }
}
