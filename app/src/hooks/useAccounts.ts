import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'
import { sanitiseAll, toAccount } from '../lib/sanitize'
import type { Account } from '../lib/types'

export function useAccounts(
  uid: string | undefined,
  /** The pre-accounts single balance, so it can be migrated rather than lost. */
  legacy: { anchorMinor?: number; anchorOn?: string; migrated?: boolean },
) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const migratingRef = useRef(false)

  useEffect(() => {
    if (!uid) {
      setAccounts([])
      setLoading(false)
      return
    }

    return onSnapshot(
      collection(db, userPath(uid, 'accounts')),
      (snap) => {
        setAccounts(sanitiseAll(snap.docs, toAccount))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  /*
  Carry the old single balance into a real account, once.

  Before accounts existed there was one anchor on the profile. Dropping it would
  silently lose a figure the user asserted, so it becomes an account called
  "Main account" keeping both its amount and its date. Gated on a flag rather
  than "are there no accounts", or deleting every account would resurrect it.
  */
  useEffect(() => {
    if (!uid || loading || migratingRef.current) return
    if (legacy.migrated !== false) return
    if (legacy.anchorMinor === undefined || !legacy.anchorOn) return
    if (accounts.length > 0) return

    migratingRef.current = true

    const batch = writeBatch(db)
    batch.set(doc(collection(db, userPath(uid, 'accounts'))), {
      name: 'Main account',
      kind: 'bank',
      openingBalanceMinor: legacy.anchorMinor,
      openingOn: legacy.anchorOn,
      isPrimary: true,
      archived: false,
      createdAt: Date.now(),
    })
    batch.set(
      doc(db, userPath(uid, 'settings'), 'profile'),
      { accountsMigratedAt: Date.now() },
      { merge: true },
    )

    batch.commit().catch(() => {
      migratingRef.current = false
    })
  }, [uid, loading, accounts.length, legacy.migrated, legacy.anchorMinor, legacy.anchorOn])

  async function createAccount(uid: string, account: Omit<Account, 'id'>) {
    await addDoc(collection(db, userPath(uid, 'accounts')), {
      ...account,
      createdAt: Date.now(),
    })
  }

  async function updateAccount(uid: string, id: string, patch: Partial<Account>) {
    await updateDoc(doc(db, userPath(uid, 'accounts'), id), patch)
  }

  /** Exactly one primary, so the default account is never ambiguous. */
  async function setPrimary(uid: string, id: string) {
    const batch = writeBatch(db)
    for (const a of accounts) {
      if (a.isPrimary === (a.id === id)) continue
      batch.update(doc(db, userPath(uid, 'accounts'), a.id), { isPrimary: a.id === id })
    }
    await batch.commit()
  }

  async function archiveAccount(uid: string, id: string) {
    await updateDoc(doc(db, userPath(uid, 'accounts'), id), { archived: true })
  }

  /** Only for an account nothing references - the caller checks. */
  async function deleteAccount(uid: string, id: string) {
    await deleteDoc(doc(db, userPath(uid, 'accounts'), id))
  }

  const active = accounts.filter((a) => !a.archived)

  return {
    accounts,
    active,
    loading,
    createAccount,
    updateAccount,
    setPrimary,
    archiveAccount,
    deleteAccount,
  }
}
