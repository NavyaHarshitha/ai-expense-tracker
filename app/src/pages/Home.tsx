import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useApp } from '../App'
import { AccountsPanel } from '../components/AccountsPanel'
import { CategoryManager } from '../components/CategoryManager'
import { SafeToSpendCard } from '../components/SafeToSpendCard'
import { TrackForm } from '../components/TrackForm'
import { TrackList } from '../components/TrackList'
import { seedDemoData } from '../dev/seed'
import { formatINR } from '../lib/money'
import type { Track } from '../lib/types'
import { card, primaryButton, secondaryButton, sectionTitle } from '../lib/ui'

/*
Home answers "where do I stand?" - income, what's already committed, and how the
tracks are doing. Adding expenses lives on its own page; analysis on Dashboard.
*/
export function Home() {
  const {
    uid,
    tracks,
    transactions,
    result,
    today,
    createTrack,
    updateTrack,
    archiveTrack,
    deleteTrack,
    reassignAndDeleteTrack,
    setIncome,
    accountsSummary,
    createAccount,
    updateAccount,
    setPrimaryAccount,
    archiveAccount,
    deleteAccount,
    categories,
    createCategory,
    renameCategory,
    archiveCategory,
    restoreCategory,
  } = useApp()

  /* How many rows carry each category, so archiving and renaming are informed. */
  const usageByName = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (t.deletedAt) continue
      counts.set(t.categoryName, (counts.get(t.categoryName) ?? 0) + 1)
    }
    return counts
  }, [transactions])

  /* How many rows sit on each account, so removing one is an informed choice. */
  const usageByAccount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (t.deletedAt) continue
      for (const id of [t.accountId, t.toAccountId]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return counts
  }, [transactions])


  const [seeding, setSeeding] = useState(false)
  const [editing, setEditing] = useState<Track | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  function startEdit(track: Track) {
    setEditing(track)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const commitments = tracks.filter((t) => t.type === 'commitment')
  const spending = tracks.filter((t) => t.type === 'spending')
  const goalsAndProjects = tracks.filter((t) => t.type === 'goal' || t.type === 'project')

  async function seed() {
    if (seeding) return
    setSeeding(true)
    try {
      await seedDemoData(uid)
    } finally {
      setSeeding(false)
    }
  }

  /*
  A track nothing references is deleted; one with history is archived, so its
  transactions never point at an id that no longer resolves.
  */
  async function removeTrack(track: Track, hasHistory: boolean) {
    if (editing?.id === track.id) setEditing(null)
    if (hasHistory) await archiveTrack(uid, track.id)
    else await deleteTrack(uid, track.id)
  }

  const listProps = {
    tracks,
    transactions,
    today,
    editingId: editing?.id ?? null,
    onEdit: startEdit,
    onRemove: removeTrack,
    onReassignAndDelete: async (track: Track, toTrackId: string) => {
      if (editing?.id === track.id) setEditing(null)
      await reassignAndDeleteTrack(uid, track.id, toTrackId)
    },
  }

  return (
    <div className="grid gap-8">
      <SafeToSpendCard result={result} onIncomeChange={(minor) => setIncome(uid, minor)} />

      <AccountsPanel
        summary={accountsSummary}
        usageByAccount={usageByAccount}
        onCreate={(account) => createAccount(uid, account)}
        onUpdate={(id, patch) => updateAccount(uid, id, patch)}
        onSetPrimary={(id) => setPrimaryAccount(uid, id)}
        onArchive={(id) => archiveAccount(uid, id)}
        onDelete={(id) => deleteAccount(uid, id)}
      />

      {transactions.length === 0 && tracks.length === 0 && (
        <section className={`${card} p-6 text-center`}>
          <h2 className="mb-2 text-xl font-bold text-ink">Start with some data</h2>
          <p className="mx-auto mb-5 max-w-lg text-muted">
            Seed two months of realistic history to see how tracks and Safe-to-Spend behave, then
            replace it with your own.
          </p>
          <button type="button" className={primaryButton} onClick={seed} disabled={seeding}>
            {seeding ? 'Seeding…' : 'Seed demo data'}
          </button>
        </section>
      )}

      <section>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[22px] font-bold text-ink">This month&rsquo;s money</h2>
          <Link to="/add" className="font-bold text-primary-dark hover:underline">
            Add an expense &rarr;
          </Link>
        </div>

        {/*
        These must agree with Safe-to-Spend, which reserves only what has NOT
        gone out yet. Showing the full committed total here while the hero
        reserved the unpaid remainder gave two different answers to the same
        question - and the bigger one looked alarming for no reason.
        */}
        <dl className="grid gap-4 sm:grid-cols-3">
          {result.basis === 'balance' ? (
            <>
              <Stat label="In your accounts" value={formatINR(result.cashMinor)} />
              <Stat
                label="Commitments still due"
                value={formatINR(result.committedRemainingMinor)}
                hint={
                  result.committedMinor > result.committedRemainingMinor
                    ? `${formatINR(result.committedMinor - result.committedRemainingMinor)} already paid`
                    : undefined
                }
              />
              <Stat
                label="Savings still to move"
                value={formatINR(result.savingsRemainingMinor)}
                hint={
                  result.plannedSavingsMinor > result.savingsRemainingMinor
                    ? `${formatINR(result.plannedSavingsMinor - result.savingsRemainingMinor)} already moved`
                    : undefined
                }
              />
            </>
          ) : (
            <>
              <Stat label="Income" value={formatINR(result.incomeMinor)} />
              <Stat label="Committed" value={formatINR(result.committedMinor)} />
              <Stat label="Into savings" value={formatINR(result.plannedSavingsMinor)} />
            </>
          )}
        </dl>
      </section>

      {commitments.length > 0 && (
        <section>
          <h2 className={sectionTitle}>Commitments</h2>
          <p className="-mt-3 mb-4 text-muted">
            Reserved before anything else, so they can never be accidentally spent. Each one
            repeats every month &mdash; there is no need for a separate track for next
            month&rsquo;s rent.
          </p>
          <TrackList {...listProps} only={['commitment']} />
        </section>
      )}

      {spending.length > 0 && (
        <section>
          <h2 className={sectionTitle}>Spending</h2>
          <TrackList {...listProps} only={['spending']} />
        </section>
      )}

      {goalsAndProjects.length > 0 && (
        <section>
          <h2 className={sectionTitle}>Savings &amp; plans</h2>
          <TrackList {...listProps} only={['goal', 'project']} />
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[22px] font-bold text-ink">Categories</h2>
        </div>
        <CategoryManager
          categories={categories}
          usageByName={usageByName}
          onCreate={(name) => createCategory(uid, name)}
          onRename={(category, name) => renameCategory(uid, category, name)}
          onArchive={(id) => archiveCategory(uid, id)}
          onRestore={(id) => restoreCategory(uid, id)}
        />
      </section>

      <section ref={formRef}>
        <h2 className={sectionTitle}>{editing ? 'Edit track' : 'Add a track'}</h2>
        <TrackForm
          editing={editing}
          onCreate={(track) => createTrack(uid, track)}
          onUpdate={(id, patch) => updateTrack(uid, id, patch)}
          onArchive={(id) => archiveTrack(uid, id)}
          onCancelEdit={() => setEditing(null)}
        />
      </section>

      {transactions.length === 0 && tracks.length > 0 && (
        <button type="button" className={secondaryButton} onClick={seed} disabled={seeding}>
          {seeding ? 'Seeding…' : 'Seed demo data (2 months)'}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} p-4`}>
      <dt className="mb-2 font-bold text-muted">{label}</dt>
      <dd className="m-0">
        <span className="tnum block text-3xl font-bold text-ink">{value}</span>
        {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
      </dd>
    </div>
  )
}
