import { useMemo } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'

import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { useTracks } from './hooks/useTracks'
import { useToday } from './hooks/useToday'
import { useTransactions } from './hooks/useTransactions'
import { computeBalance, type BalanceResult } from './lib/balance'
import { computeSafeToSpend, type SafeToSpendResult } from './lib/safeToSpend'
import { linkButton } from './lib/ui'
import type { Track, Transaction } from './lib/types'

export interface AppContext {
  uid: string
  tracks: Track[]
  transactions: Transaction[]
  result: SafeToSpendResult
  balance: BalanceResult
  today: Date
  createTrack: (uid: string, track: Omit<Track, 'id'>) => Promise<void>
  updateTrack: (uid: string, id: string, patch: Partial<Track>) => Promise<void>
  archiveTrack: (uid: string, id: string) => Promise<void>
  createTransaction: (uid: string, txn: Omit<Transaction, 'id'>) => Promise<string>
  updateTransaction: (uid: string, id: string, patch: Partial<Transaction>) => Promise<void>
  softDelete: (uid: string, id: string) => Promise<void>
  setIncome: (uid: string, minor: number) => Promise<void>
  setBalanceAnchor: (uid: string, minor: number, on: string) => Promise<void>
}

/** Typed accessor so pages don't repeat the generic. */
export function useApp() {
  return useOutletContext<AppContext>()
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/add', label: 'Add Expense', end: false },
  { to: '/dashboard', label: 'Dashboard', end: false },
]

export default function App() {
  const { user, loading: authLoading, error, signIn, signOut } = useAuth()
  const uid = user?.uid

  const { active: tracks, createTrack, updateTrack, archiveTrack } = useTracks(uid)
  const { transactions, createTransaction, updateTransaction, softDelete } = useTransactions(uid)
  const { monthlyIncomeMinor, balanceAnchorMinor, balanceAnchorOn, setIncome, setBalanceAnchor } =
    useProfile(uid)

  /*
  A live value, not a snapshot taken at first render. `today` is now a memo
  dependency, so the figures recompute when the calendar day rolls over even if
  no Firestore change arrives.
  */
  const today = useToday()

  const balance = useMemo(
    () =>
      computeBalance({
        anchorMinor: balanceAnchorMinor,
        anchorOn: balanceAnchorOn,
        transactions,
        tracks,
      }),
    [balanceAnchorMinor, balanceAnchorOn, transactions, tracks],
  )

  // Recomputed whenever Firestore pushes a change, or the day turns over.
  const result = useMemo(
    () => computeSafeToSpend({ monthlyIncomeMinor, tracks, transactions, today }),
    [monthlyIncomeMinor, tracks, transactions, today],
  )

  if (authLoading) {
    return <div className="grid min-h-dvh place-items-center text-muted">Loading&hellip;</div>
  }

  if (!user || !uid) {
    return <SignIn onSignIn={signIn} error={error} />
  }

  const context: AppContext = {
    uid,
    tracks,
    transactions,
    result,
    balance,
    today,
    createTrack,
    updateTrack,
    archiveTrack,
    createTransaction,
    updateTransaction,
    softDelete,
    setIncome,
    setBalanceAnchor,
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur-md">
        <nav className="mx-auto flex min-h-[72px] w-[min(1100px,90%)] items-center justify-between gap-4">
          <span className="text-xl font-extrabold text-primary-dark">AI Expense Tracker</span>

          <ul className="flex list-none items-center gap-2 p-0">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-block rounded-full px-3 py-2 font-bold transition ${
                      isActive
                        ? 'bg-primary-soft text-primary-dark'
                        : 'text-muted hover:bg-primary-soft hover:text-primary-dark'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
            <button type="button" className={linkButton} onClick={signOut}>
              Sign out
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-[min(1100px,90%)] py-14">
        <Outlet context={context} />
      </main>

      <footer className="border-t border-line bg-surface py-6 text-center">
        <p className="m-0 text-sm text-muted">&copy; 2026 Navya. All rights reserved.</p>
      </footer>
    </>
  )
}
