import { useState } from 'react'

import { ACCOUNT_KIND_LABELS, type AccountsSummary } from '../lib/accounts'
import { formatINR, toPaise } from '../lib/money'
import type { Account, AccountKind } from '../lib/types'
import { card, eyebrow, field, fieldLabel, linkButton, primaryButton, secondaryButton } from '../lib/ui'

const KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'credit_card']

function todayIso() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/*
Accounts, with a balance each and one honest total.

The per-account figure is the point. A single combined balance cannot answer
"will HDFC cover the rent on the 5th" - and that is the question a person with
two accounts actually has.
*/
export function AccountsPanel({
  summary,
  usageByAccount,
  onCreate,
  onUpdate,
  onSetPrimary,
  onArchive,
  onDelete,
}: {
  summary: AccountsSummary
  usageByAccount: Map<string, number>
  onCreate: (account: Omit<Account, 'id'>) => Promise<void>
  onUpdate: (id: string, patch: Partial<Account>) => Promise<void>
  onSetPrimary: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const hasCards = summary.balances.some((b) => b.account.kind === 'credit_card')

  if (summary.balances.length === 0 && !adding) {
    return (
      <section className={`${card} p-6`}>
        <span className={eyebrow}>Accounts</span>
        <p className="mt-2 mb-4 text-muted">
          Bank, cash, wallet or credit card.
        </p>
        <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
          Add an account
        </button>
      </section>
    )
  }

  return (
    <section className={`${card} p-6`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <span className={eyebrow}>Accounts</span>
        {!adding && !editing && (
          <button type="button" className={linkButton} onClick={() => setAdding(true)}>
            + Add account
          </button>
        )}
      </div>

      {/* One honest total: cash less what is owed. */}
      <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="m-0 text-sm text-muted">Across your accounts</p>
          <p className="tnum m-0 text-4xl font-bold text-ink">
            {formatINR(summary.totalCashMinor)}
          </p>
        </div>

        {hasCards && (
          <div>
            <p className="m-0 text-sm text-muted">
              Owed on cards &middot; net {formatINR(summary.netWorthMinor)}
            </p>
            <p className="tnum m-0 text-2xl font-bold text-danger">
              {formatINR(summary.totalOwedMinor)}
            </p>
          </div>
        )}
      </div>

      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {summary.balances.map(({ account, balanceMinor, countedRows }) => {
          const isCard = account.kind === 'credit_card'
          const negative = !isCard && balanceMinor < 0

          return (
            <li key={account.id} className="rounded-field border border-line bg-canvas p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-ink">
                  {account.name}
                  {account.isPrimary && (
                    <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-primary-dark">
                      Default
                    </span>
                  )}
                </span>
                <span
                  className={`tnum whitespace-nowrap font-bold ${
                    isCard || negative ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {formatINR(balanceMinor)}
                </span>
              </div>

              <p className="m-0 mt-1 text-sm text-muted">
                {ACCOUNT_KIND_LABELS[account.kind]}
                {isCard ? ' · owed' : ''}
                {isCard && account.dueDay ? ` · due on the ${account.dueDay}` : ''}
                {' · '}
                {countedRows} entr{countedRows === 1 ? 'y' : 'ies'}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-xs font-bold text-muted hover:underline"
                  onClick={() => setEditing(account)}
                >
                  Edit
                </button>
                {!account.isPrimary && account.kind !== 'credit_card' && (
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 text-xs font-bold text-muted hover:underline"
                    onClick={() => onSetPrimary(account.id)}
                  >
                    Make default
                  </button>
                )}
                <RemoveAccount
                  account={account}
                  usedBy={usageByAccount.get(account.id) ?? 0}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {(adding || editing) && (
        <AccountForm
          editing={editing}
          onCancel={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSave={async (values) => {
            if (editing) await onUpdate(editing.id, values)
            else await onCreate({ ...values, archived: false } as Omit<Account, 'id'>)
            setAdding(false)
            setEditing(null)
          }}
        />
      )}

    </section>
  )
}

function RemoveAccount({
  account,
  usedBy,
  onArchive,
  onDelete,
}: {
  account: Account
  usedBy: number
  onArchive: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const hasHistory = usedBy > 0

  if (!confirming) {
    return (
      <button
        type="button"
        className="rounded px-2 py-0.5 text-xs font-bold text-danger hover:underline"
        onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    )
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {/* Same rule as tracks: history is archived, mistakes are deleted. */}
      <button
        type="button"
        className="rounded border border-danger px-2 py-0.5 font-extrabold uppercase tracking-wide text-danger hover:bg-danger-soft"
        onClick={() => (hasHistory ? onArchive(account.id) : onDelete(account.id))}
      >
        {hasHistory ? `Archive (${usedBy} entries)` : 'Delete'}
      </button>
      <button type="button" className="font-bold text-muted hover:underline" onClick={() => setConfirming(false)}>
        No
      </button>
    </span>
  )
}

function AccountForm({
  editing,
  onSave,
  onCancel,
}: {
  editing: Account | null
  onSave: (values: Partial<Account>) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(editing?.kind ?? 'bank')
  const [balance, setBalance] = useState(
    editing ? String(editing.openingBalanceMinor / 100) : '',
  )
  const [on, setOn] = useState(editing?.openingOn ?? todayIso())
  const [dueDay, setDueDay] = useState(String(editing?.dueDay ?? 1))
  const [busy, setBusy] = useState(false)

  const valid = name.trim() !== '' && balance.trim() !== '' && Number.isFinite(Number(balance))

  return (
    <div className="mt-5 grid gap-3 rounded-field border border-line-strong bg-canvas p-4 sm:max-w-lg">
      <p className="m-0 font-extrabold text-primary-dark">
        {editing ? `Edit “${editing.name}”` : 'New account'}
      </p>

      <div>
        <span className={fieldLabel}>Type</span>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                kind === k
                  ? 'border-primary bg-primary text-surface'
                  : 'border-line-strong bg-surface text-muted hover:border-primary-edge'
              }`}
            >
              {ACCOUNT_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={fieldLabel} htmlFor="acc-name">
          Name
        </label>
        <input
          id="acc-name"
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'credit_card' ? 'HDFC Credit Card' : 'HDFC Savings'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={fieldLabel} htmlFor="acc-bal">
            {kind === 'credit_card' ? 'Currently owed' : 'Current balance'}
          </label>
          <input
            id="acc-bal"
            className={`${field} tnum`}
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="50000"
          />
        </div>

        <div>
          <label className={fieldLabel} htmlFor="acc-on">
            As of
          </label>
          <input
            id="acc-on"
            className={field}
            type="date"
            value={on}
            max={todayIso()}
            onChange={(e) => setOn(e.target.value)}
          />
        </div>
      </div>

      {kind === 'credit_card' && (
        <div className="sm:max-w-40">
          <label className={fieldLabel} htmlFor="acc-due">
            Bill due day
          </label>
          <input
            id="acc-due"
            className={`${field} tnum`}
            type="number"
            min="1"
            max="31"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
      )}

      <p className="m-0 text-sm text-muted">
        Entries dated before this are ignored.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true)
            await onSave({
              name: name.trim(),
              kind,
              openingBalanceMinor: toPaise(balance),
              openingOn: on || todayIso(),
              ...(kind === 'credit_card'
                ? { dueDay: Math.min(31, Math.max(1, Number(dueDay) || 1)) }
                : { dueDay: null as unknown as undefined }),
            })
          }}
        >
          {busy ? 'Saving…' : editing ? 'Update account' : 'Add account'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
