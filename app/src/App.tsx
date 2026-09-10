import { useMemo } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'

import { SignIn } from './components/SignIn'
import { ThemeToggle } from './components/ThemeToggle'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import { useTracks } from './hooks/useTracks'
import { useAccounts } from './hooks/useAccounts'
import { useCategories } from './hooks/useCategories'
import { useTheme, type ResolvedTheme } from './hooks/useTheme'
import { useToday } from './hooks/useToday'
import { useTransactions } from './hooks/useTransactions'
import { summariseAccounts, type AccountsSummary } from './lib/accounts'
import { computeBalance, type BalanceResult } from './lib/balance'
import { computeSafeToSpend, type SafeToSpendResult } from './lib/safeToSpend'
import { linkButton } from './lib/ui'
import type { Account, Category, Track, Transaction } from './lib/types'

export interface AppContext {
  uid: string
  tracks: Track[]
  transactions: Transaction[]
  result: SafeToSpendResult
  balance: BalanceResult
  categories: Category[]
  accounts: Account[]
  accountsSummary: AccountsSummary
  /** Charts need the actual colour in JS, not through a CSS variable. */
  theme: ResolvedTheme
  today: Date
  createTrack: (uid: string, track: Omit<Track, 'id'>) => Promise<void>
  updateTrack: (uid: string, id: string, patch: Partial<Track>) => Promise<void>
  archiveTrack: (uid: string, id: string) => Promise<void>
  deleteTrack: (uid: string, id: string) => Promise<void>
  reassignAndDeleteTrack: (
    uid: string,
    id: string,
    toTrackId: string,
  ) => Promise<{ rowsMoved: number }>
  createTransaction: (uid: string, txn: Omit<Transaction, 'id'>) => Promise<string>
  updateTransaction: (uid: string, id: string, patch: Partial<Transaction>) => Promise<void>
  softDelete: (uid: string, id: string) => Promise<void>
  setIncome: (uid: string, minor: number) => Promise<void>
  setBalanceAnchor: (uid: string, minor: number, on: string) => Promise<void>
  paydayDay?: number
  setPayday: (uid: string, day: number | null) => Promise<void>
  createCategory: (uid: string, name: string, from?: Category['createdFrom']) => Promise<void>
  renameCategory: (uid: string, category: Category, name: string) => Promise<{ rowsUpdated: number }>
  archiveCategory: (uid: string, id: string) => Promise<void>
  restoreCategory: (uid: string, id: string) => Promise<void>
  createAccount: (uid: string, account: Omit<Account, 'id'>) => Promise<void>
  updateAccount: (uid: string, id: string, patch: Partial<Account>) => Promise<void>
  setPrimaryAccount: (uid: string, id: string) => Promise<void>
  archiveAccount: (uid: string, id: string) => Promise<void>
  deleteAccount: (uid: string, id: string) => Promise<void>
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

  const {
    active: tracks,
    createTrack,
    updateTrack,
    archiveTrack,
    deleteTrack,
    reassignAndDeleteTrack,
  } = useTracks(uid)
  const { transactions, createTransaction, updateTransaction, softDelete } = useTransactions(uid)
  const {
    monthlyIncomeMinor,
    balanceAnchorMinor,
    balanceAnchorOn,
    categoriesSeeded,
    accountsMigrated,
    paydayDay,
    setIncome,
    setPayday,
    setBalanceAnchor,
  } = useProfile(uid)

  const {
    active: categories,
    createCategory,
    renameCategory,
    archiveCategory,
    restoreCategory,
  } = useCategories(uid, categoriesSeeded)

  const {
    active: accounts,
    createAccount,
    updateAccount,
    setPrimary: setPrimaryAccount,
    archiveAccount,
    deleteAccount,
  } = useAccounts(uid, {
    anchorMinor: balanceAnchorMinor,
    anchorOn: balanceAnchorOn,
    migrated: accountsMigrated,
  })

  const accountsSummary = useMemo(
    () => summariseAccounts(accounts, transactions),
    [accounts, transactions],
  )

  /*
  A live value, not a snapshot taken at first render. `today` is now a memo
  dependency, so the figures recompute when the calendar day rolls over even if
  no Firestore change arrives.
  */
  const today = useToday()
  const theme = useTheme()

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
    () =>
      computeSafeToSpend({
        monthlyIncomeMinor,
        tracks,
        transactions,
        today,
        paydayDay,
        /*
        Real money wins when it exists. Passing undefined - not zero - when
        there are no accounts is what selects the income fallback; zero would
        read as "you have nothing" and show everything as overspent.
        */
        ...(accounts.length > 0
          ? {
              cashMinor: accountsSummary.totalCashMinor,
              owedMinor: accountsSummary.totalOwedMinor,
            }
          : {}),
      }),
    [monthlyIncomeMinor, tracks, transactions, today, paydayDay, accounts.length, accountsSummary],
  )

  if (authLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid min-h-dvh place-items-center text-muted"
      >
        Loading&hellip;
      </div>
    )
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
    categories,
    accounts,
    accountsSummary,
    theme: theme.resolved,
    today,
    createTrack,
    updateTrack,
    archiveTrack,
    deleteTrack,
    reassignAndDeleteTrack,
    createTransaction,
    updateTransaction,
    softDelete,
    setIncome,
    setBalanceAnchor,
    paydayDay,
    setPayday,
    createCategory,
    renameCategory,
    archiveCategory,
    restoreCategory,
    createAccount,
    updateAccount,
    setPrimaryAccount,
    archiveAccount,
    deleteAccount,
  }

  return (
    <>
      {/* First stop for a keyboard user, visible only once focused. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur-md">
        <nav
          aria-label="Main"
          className="mx-auto flex min-h-[72px] w-[min(1100px,90%)] items-center justify-between gap-4"
        >
          <span className="text-xl font-extrabold text-primary-dark">Safe to Spend</span>

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
            <ThemeToggle choice={theme.choice} resolved={theme.resolved} onCycle={theme.cycle} />
            <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
            <button type="button" className={linkButton} onClick={signOut}>
              Sign out
            </button>
          </div>
        </nav>
      </header>

      {/* tabIndex -1 so the skip link can actually move focus here, not just scroll. */}
      <main id="main" tabIndex={-1} className="mx-auto w-[min(1100px,90%)] py-14">
        <Outlet context={context} />
      </main>

      <footer className="border-t border-line bg-surface py-6 text-center">
        <p className="m-0 text-sm text-muted">&copy; 2026 Navya. All rights reserved.</p>
      </footer>
    </>
  )
}
