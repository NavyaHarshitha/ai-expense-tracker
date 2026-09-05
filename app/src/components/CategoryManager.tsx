import { useMemo, useState } from 'react'

import { categoryNames, checkDuplicate } from '../lib/categories'
import type { Category } from '../lib/types'
import { cardPadded, field, fieldLabel, linkButton, primaryButton, sectionTitle } from '../lib/ui'

/*
Create, rename and archive categories.

The duplicate warning is the point of this screen. Categories multiply fast -
"Food", "Foods", "Eating", "Lunch" - and once they have, every breakdown is
noise and the only fix is manual tidying. Catching it at creation costs one
sentence; catching it later costs an afternoon.
*/
export function CategoryManager({
  categories,
  usageByName,
  onCreate,
  onRename,
  onArchive,
  onRestore,
}: {
  categories: Category[]
  /** How many transactions carry each name, so archiving is an informed choice. */
  usageByName: Map<string, number>
  onCreate: (name: string) => Promise<void>
  onRename: (category: Category, name: string) => Promise<{ rowsUpdated: number }>
  onArchive: (id: string) => Promise<void>
  onRestore: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [renaming, setRenaming] = useState<Category | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const live = useMemo(() => categories.filter((c) => !c.archived), [categories])
  const archived = useMemo(() => categories.filter((c) => c.archived), [categories])

  const check = useMemo(() => checkDuplicate(draft, categories), [draft, categories])
  const canCreate = draft.trim() !== '' && !check.exact

  const ordered = useMemo(() => {
    const byName = new Map(live.map((c) => [c.name, c]))
    return categoryNames(live)
      .map((n) => byName.get(n))
      .filter((c): c is Category => Boolean(c))
  }, [live])

  async function create() {
    if (!canCreate || busy) return
    setBusy(true)
    await onCreate(draft.trim())
    setDraft('')
    setBusy(false)
  }

  async function commitRename() {
    if (!renaming) return
    setBusy(true)
    const { rowsUpdated } = await onRename(renaming, renameDraft)
    setRenaming(null)
    setBusy(false)
    if (rowsUpdated > 0) {
      setFlash(`Renamed, and updated ${rowsUpdated} past entr${rowsUpdated === 1 ? 'y' : 'ies'}`)
      setTimeout(() => setFlash(''), 4000)
    }
  }

  if (!open) {
    return (
      <button type="button" className={linkButton} onClick={() => setOpen(true)}>
        Manage categories ({live.length})
      </button>
    )
  }

  return (
    <section className={cardPadded}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className={`${sectionTitle} mb-0`}>Categories</h3>
        <button type="button" className={linkButton} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      {/* ---- create ---- */}
      <div className="mb-6 grid gap-2 sm:max-w-md">
        <label className={fieldLabel} htmlFor="cat-new">
          New category
        </label>
        <div className="flex gap-2">
          <input
            id="cat-new"
            className={field}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pets, Fuel, Gifts…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
            }}
          />
          <button type="button" className={primaryButton} disabled={!canCreate || busy} onClick={create}>
            Add
          </button>
        </div>

        {check.exact && (
          <p className="m-0 text-sm font-bold text-danger">
            You already have &ldquo;{check.exact.name}&rdquo;.
          </p>
        )}

        {!check.exact && check.similar.length > 0 && (
          <p className="m-0 text-sm text-warn">
            Close to {check.similar.map((c) => `“${c.name}”`).join(', ')} &mdash; use that instead
            unless this is genuinely different.
          </p>
        )}
      </div>

      {flash && <p className="mb-4 text-sm font-bold text-good">{flash}</p>}

      {/* ---- list ---- */}
      <ul className="m-0 grid list-none gap-2 p-0">
        {ordered.map((c) => {
          const used = usageByName.get(c.name) ?? 0
          const isRenaming = renaming?.id === c.id

          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-0"
            >
              {isRenaming ? (
                <>
                  <input
                    className={`${field} max-w-56`}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy || !renameDraft.trim()}
                    onClick={commitRename}
                  >
                    Save
                  </button>
                  <button type="button" className={linkButton} onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                  {used > 0 && (
                    <span className="text-sm text-muted">
                      will also update {used} past entr{used === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="flex-1 font-bold text-ink">{c.name}</span>
                  <span className="tnum text-sm text-muted">
                    {used} entr{used === 1 ? 'y' : 'ies'}
                  </span>
                  {c.createdFrom === 'voice' && (
                    <span className="rounded-full bg-lavender px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-primary-dark">
                      by voice
                    </span>
                  )}
                  <button
                    type="button"
                    className={linkButton}
                    onClick={() => {
                      setRenaming(c)
                      setRenameDraft(c.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="rounded-full px-3 py-2 font-bold text-danger transition hover:bg-danger-soft"
                    onClick={() => onArchive(c.id)}
                  >
                    Archive
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-4 mb-0 text-sm text-muted">
        Archiving stops a category being offered for new entries. Past entries keep the name they
        were filed under, so your history stays truthful.
      </p>

      {/* ---- archived ---- */}
      {archived.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            className={linkButton}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>

          {showArchived && (
            <ul className="m-0 mt-2 grid list-none gap-2 p-0">
              {archived.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-muted">
                  <span className="flex-1">{c.name}</span>
                  <button type="button" className={linkButton} onClick={() => onRestore(c.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
