import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'

/** Monthly income is the starting point for Safe-to-Spend, so it lives in one place. */
export function useProfile(uid: string | undefined) {
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState(0)
  const [balanceAnchorMinor, setBalanceAnchorMinor] = useState<number | undefined>(undefined)
  const [balanceAnchorOn, setBalanceAnchorOn] = useState<string | undefined>(undefined)
  // undefined while loading, then true/false - so seeding never runs on a guess.
  const [categoriesSeeded, setCategoriesSeeded] = useState<boolean | undefined>(undefined)
  const [accountsMigrated, setAccountsMigrated] = useState<boolean | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }

    return onSnapshot(
      doc(db, userPath(uid, 'settings'), 'profile'),
      (snap) => {
        const data = snap.data()
        setMonthlyIncomeMinor(data?.monthlyIncomeMinor ?? 0)
        // undefined, not 0 - "never set" and "genuinely zero" are different states.
        setBalanceAnchorMinor(data?.balanceAnchorMinor ?? undefined)
        setBalanceAnchorOn(data?.balanceAnchorOn ?? undefined)
        setCategoriesSeeded(Boolean(data?.categoriesSeededAt))
        setAccountsMigrated(Boolean(data?.accountsMigratedAt))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  async function setIncome(uid: string, minor: number) {
    await setDoc(
      doc(db, userPath(uid, 'settings'), 'profile'),
      { monthlyIncomeMinor: minor },
      { merge: true },
    )
  }

  /**
   * Re-anchor the balance to a figure you have just read off your bank, as of a date.
   *
   * This is reconciliation: everything before the date is forgotten and the
   * running total restarts from the asserted figure.
   */
  async function setBalanceAnchor(uid: string, minor: number, on: string) {
    await setDoc(
      doc(db, userPath(uid, 'settings'), 'profile'),
      { balanceAnchorMinor: minor, balanceAnchorOn: on },
      { merge: true },
    )
  }

  return {
    monthlyIncomeMinor,
    balanceAnchorMinor,
    balanceAnchorOn,
    categoriesSeeded,
    accountsMigrated,
    loading,
    setIncome,
    setBalanceAnchor,
  }
}
