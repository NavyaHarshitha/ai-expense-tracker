import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'

import { db, userPath } from '../lib/firebase'

/** Monthly income is the starting point for Safe-to-Spend, so it lives in one place. */
export function useProfile(uid: string | undefined) {
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }

    return onSnapshot(
      doc(db, userPath(uid, 'settings'), 'profile'),
      (snap) => {
        setMonthlyIncomeMinor(snap.data()?.monthlyIncomeMinor ?? 0)
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

  return { monthlyIncomeMinor, loading, setIncome }
}
