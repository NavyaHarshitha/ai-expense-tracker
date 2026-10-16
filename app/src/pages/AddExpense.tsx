import { useCallback, useMemo, useRef, useState } from 'react'

import { useApp } from '../App'
import { QuickAdd } from '../components/QuickAdd'
import { TransactionList } from '../components/TransactionList'
import { categoryNames } from '../lib/categories'
import { formatINR } from '../lib/money'
import { isInMonth } from '../lib/safeToSpend'
import type { Transaction } from '../lib/types'

/*
Entry and the ledger, together. You add something and see it appear in the list
immediately below - which is the fastest way to notice a mistake.
*/
export function AddExpense() {
  const {
    uid,
    tracks,
    transactions,
    categories,
    accounts,
    today,
    createTransaction,
    createTrack,
    updateTransaction,
    softDelete,
    renameCategory,
  } = useApp()

  // Names only, ordered for a dropdown - the components never need the docs.
  const categoryNameList = useMemo(() => categoryNames(categories), [categories])

  const [editing, setEditing] = useState<Transaction | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  /*
  Wrapped in useCallback because TransactionList's rows are memoized - a new
  function identity on every render would defeat the memo and re-render every
  visible row on each keystroke in the search box.
  */
  const startEdit = useCallback((txn: Transaction) => {
    setEditing(txn)
    // The form is above the table, so scroll back to it - otherwise clicking
    // edit on row 30 appears to do nothing at all.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      setEditing((current) => (current?.id === id ? null : current))
      softDelete(uid, id)
    },
    [softDelete, uid],
  )

  const thisMonth = transactions.filter((t) => isInMonth(t.occurredOn, today))
  const monthSpend = thisMonth.reduce(
    (sum, t) =>
      t.movement === 'expense'
        ? sum + t.amountMinor
        : t.movement === 'refund'
          ? sum - t.amountMinor
          : sum,
    0,
  )

  return (
    <div className="grid gap-8">
      <div ref={formRef}>
        <QuickAdd
          uid={uid}
          tracks={tracks}
          categories={categoryNameList}
          categoryDocs={categories}
          accounts={accounts}
          recent={transactions}
          onRenameCategory={renameCategory}
          today={today}
          editing={editing}
          onAdd={(txn) => createTransaction(uid, txn)}
          onCreateTrack={(track) => createTrack(uid, track)}
          onUpdate={(id, patch) => updateTransaction(uid, id, patch)}
          onDelete={(id) => softDelete(uid, id)}
          onCancelEdit={() => setEditing(null)}
        />
      </div>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[22px] font-bold text-ink">Transactions</h2>
          <p className="m-0 text-muted">
            <span className="tnum font-bold text-ink">{formatINR(monthSpend)}</span> across{' '}
            {thisMonth.length} entr{thisMonth.length === 1 ? 'y' : 'ies'} this month
          </p>
        </div>

        <TransactionList
          transactions={transactions}
          tracks={tracks}
          editingId={editing?.id ?? null}
          onEdit={startEdit}
          onDelete={handleDelete}
        />
      </section>
    </div>
  )
}
