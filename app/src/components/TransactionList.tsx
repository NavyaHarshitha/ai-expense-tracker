import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { useDebounced } from '../hooks/useDebounced'
import {
  EMPTY_FILTERS,
  type TransactionFilters,
  categoryCounts,
  filterIndexed,
  hasActiveFilters,
  indexTransactions,
  netSpendOf,
} from '../lib/filterTransactions'
import { formatINR } from '../lib/money'
import { MOVEMENT_LABELS, PAYMENT_METHOD_LABELS, type Movement, type Track, type Transaction } from '../lib/types'
import { card, field, linkButton } from '../lib/ui'

/**
 * Rows rendered per page.
 *
 * This is the number that actually protects performance. Filtering 50,000 rows
 * costs about a millisecond; rendering 50,000 <tr> elements locks the tab. The
 * data can be any size - the DOM stays this size.
 */
const PAGE_SIZE = 50

const SIGN: Record<Movement, string> = { expense: '-', refund: '+', income: '+', transfer: '' }

const TONE: Record<Movement, string> = {
  expense: 'text-ink',
  refund: 'text-good',
  income: 'text-good',
  transfer: 'text-muted',
}

/** Matches the small square icon buttons from the original design. */
const iconButton =
  'inline-flex h-6 w-7 items-center justify-center rounded border border-line-strong bg-surface text-muted transition hover:border-ink hover:text-ink'

const cell = 'border-b border-line px-4 py-4'

/*
Extracted and memoized so that typing in the search box re-renders only the
rows that actually changed. Requires stable callbacks from the parent, which is
why onEdit/onDelete are wrapped in useCallback below.
*/
const Row = memo(function Row({
  txn,
  trackName,
  isEditing,
  onEdit,
  onDelete,
}: {
  txn: Transaction
  trackName: string
  isEditing: boolean
  onEdit: (txn: Transaction) => void
  onDelete: (id: string) => void
}) {
  return (
    <tr className={`transition ${isEditing ? 'bg-primary-soft' : 'hover:bg-primary-soft'}`}>
      <td className={`${cell} tnum`}>{txn.occurredOn}</td>
      <td className={cell}>
        {txn.description}
        {txn.note && (
          <span className="mt-0.5 block text-sm italic text-muted">&ldquo;{txn.note}&rdquo;</span>
        )}
      </td>
      <td className={cell}>{txn.categoryName}</td>
      <td className={cell}>{trackName}</td>
      <td className={cell}>{PAYMENT_METHOD_LABELS[txn.paymentMethod]}</td>
      <td className={`${cell} tnum font-bold ${TONE[txn.movement]}`}>
        {SIGN[txn.movement]}
        {formatINR(txn.amountMinor)}
      </td>
      <td className={cell}>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onEdit(txn)}
            aria-label={`Edit ${txn.description}`}
            title="Edit expense"
            className={iconButton}
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z" />
              <path d="M19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05Z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => onDelete(txn.id)}
            aria-label={`Delete ${txn.description}`}
            title="Delete expense"
            className={iconButton}
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
              <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
})

export function TransactionList({
  transactions,
  tracks,
  editingId,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[]
  tracks: Track[]
  editingId?: string | null
  onEdit: (txn: Transaction) => void
  onDelete: (id: string) => void
}) {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  // The input stays instant; only the filtering waits for the pause in typing.
  const debouncedQuery = useDebounced(filters.query, 200)

  // Built once per data change, not once per keystroke.
  const indexed = useMemo(() => indexTransactions(transactions), [transactions])

  const categories = useMemo(() => categoryCounts(transactions), [transactions])

  const trackName = useCallback(
    (id: string) => tracks.find((t) => t.id === id)?.name ?? 'Unassigned',
    [tracks],
  )

  const filtered = useMemo(
    () => filterIndexed(indexed, { ...filters, query: debouncedQuery }),
    [indexed, filters.category, filters.track, filters.movement, debouncedQuery],
  )

  // A new search should start at the top, not 400 rows down.
  useEffect(() => {
    setPage(1)
  }, [filters.category, filters.track, filters.movement, debouncedQuery])

  const visible = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page])
  const net = useMemo(() => netSpendOf(filtered), [filtered])

  // Stable identities, so memoized rows don't re-render on every parent render.
  const handleEdit = useCallback((txn: Transaction) => onEdit(txn), [onEdit])
  const handleDelete = useCallback((id: string) => onDelete(id), [onDelete])

  const set = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }))

  const active = hasActiveFilters({ ...filters, query: debouncedQuery })

  return (
    <div className="grid gap-4">
      {/* ---------- filters ---------- */}
      <div className={`${card} p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="sr-only" htmlFor="f-query">
              Search transactions
            </label>
            <input
              id="f-query"
              className={field}
              type="search"
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
              placeholder="Search description or note…"
            />
          </div>

          <div>
            <label className="sr-only" htmlFor="f-category">
              Filter by category
            </label>
            <select
              id="f-category"
              className={field}
              value={filters.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="f-track">
              Filter by track
            </label>
            <select
              id="f-track"
              className={field}
              value={filters.track}
              onChange={(e) => set('track', e.target.value)}
            >
              <option value="">All tracks</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="f-movement">
              Filter by type
            </label>
            <select
              id="f-movement"
              className={field}
              value={filters.movement}
              onChange={(e) => set('movement', e.target.value as Movement | '')}
            >
              <option value="">All types</option>
              {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-muted">
            <span className="tnum font-bold text-ink">{filtered.length}</span>
            {active && <> of {transactions.length}</>} entr
            {filtered.length === 1 ? 'y' : 'ies'} &middot; net{' '}
            <span className="tnum font-bold text-ink">{formatINR(net)}</span>
          </p>

          {active && (
            <button type="button" className={linkButton} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ---------- table ---------- */}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong p-8 text-center">
          <p className="m-0 text-muted">
            {active ? 'Nothing matches those filters.' : 'Nothing recorded yet.'}
          </p>
        </div>
      ) : (
        <>
          <section className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[760px] border-collapse">
              <caption className="sr-only">Transactions</caption>

              <thead>
                <tr>
                  {['Date', 'Description', 'Category', 'Track', 'Payment', 'Amount', ''].map(
                    (h, i) => (
                      <th
                        key={h || i}
                        scope="col"
                        className="border-b border-line bg-[#f9fafb] px-4 py-4 text-left text-sm uppercase tracking-wide text-ink-soft"
                      >
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {visible.map((t) => (
                  <Row
                    key={t.id}
                    txn={t}
                    trackName={trackName(t.trackId)}
                    isEditing={editingId === t.id}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </section>

          {visible.length < filtered.length && (
            <div className="text-center">
              <button
                type="button"
                className={linkButton}
                onClick={() => setPage((p) => p + 1)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more &middot;{' '}
                {visible.length} of {filtered.length} shown
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
