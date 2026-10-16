import { useState } from 'react'

import { useImport } from '../hooks/useImport'
import { todayKey } from '../hooks/useToday'
import {
  IMPORT_COLUMNS,
  planImport,
  readImport,
  summariseImport,
  type ImportPlan,
  type ImportProblem,
  type ImportRow,
} from '../lib/importCsv'
import { formatINR } from '../lib/money'
import type { Category, Track, Transaction } from '../lib/types'
import { cardPadded, linkButton, primaryButton, secondaryButton, sectionTitle } from '../lib/ui'

const TEMPLATE = [
  IMPORT_COLUMNS.join(','),
  '2026-07-01,swiggy,311,Food,expense,Daily Expenses',
  '2026-07-01,Rent,15000,Rent,expense,Rent',
  '2026-07-06,Salary,120000,Salary,income,Daily Expenses',
  '2026-07-06,friend paid back,185,Food,refund,Daily Expenses',
  '2026-07-01,Mutual funds,15000,Mutual funds,savings,Mutual Funds',
].join('\n')

const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`

const SHOWN_PROBLEMS = 5

interface Preview {
  fileName: string
  rows: ImportRow[]
  problems: ImportProblem[]
  plan: ImportPlan
}

/*
Import from a spreadsheet, in two steps: choose a file and see exactly what it
holds, then import. Rows that cannot be read are listed by line and left out -
never guessed at - so the user can fix them in the sheet and import those alone.
*/
export function ImportPanel({
  uid,
  tracks,
  categories,
  transactions,
}: {
  uid: string
  tracks: Track[]
  categories: Category[]
  transactions: Transaction[]
}) {
  const importer = useImport(uid, tracks, categories, transactions)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    setDone(null)
    if (!file) return
    const { rows, problems } = readImport(await file.text(), todayKey())
    setPreview({ fileName: file.name, rows, problems, plan: planImport(rows, tracks, categories) })
  }

  async function confirm() {
    if (!preview) return
    const result = await importer.run(preview.rows)
    if (!result) return
    setPreview(null)
    setDone(
      `Imported ${result.rowsWritten} entries` +
        (result.tracksCreated ? `, created ${result.tracksCreated} track${result.tracksCreated === 1 ? '' : 's'}` : '') +
        '.',
    )
  }

  async function undo() {
    const ok = window.confirm(
      `Remove all ${importer.importedCount} imported entries? Entries you added yourself are not touched.`,
    )
    if (!ok) return
    const removed = await importer.undo()
    if (removed) setDone(`Removed ${removed} imported entries.`)
  }

  const summary = preview ? summariseImport(preview.rows) : null

  return (
    <section className={cardPadded}>
      <h2 className={sectionTitle}>Import from a spreadsheet</h2>
      <p className="mt-0 text-ink-soft">
        Bring in past entries from a CSV file with the columns{' '}
        <code className="text-sm">{IMPORT_COLUMNS.join(', ')}</code>.{' '}
        <a href={TEMPLATE_HREF} download="safe-to-spend-template.csv" className="font-bold text-primary-dark underline">
          Download a template
        </a>
        .
      </p>

      {!preview && (
        <label className={`${secondaryButton} cursor-pointer`}>
          Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              choose(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      )}

      {preview && summary && (
        <div className="grid gap-3">
          <p className="m-0 font-bold text-ink">
            {preview.fileName}: {summary.count} entr{summary.count === 1 ? 'y' : 'ies'}
            {summary.count > 0 && ` from ${summary.from} to ${summary.to}`}
          </p>

          {summary.count > 0 && (
            <ul className="m-0 grid list-disc gap-1 pl-5 text-ink-soft">
              <li>Spent {formatINR(summary.totalsMinor.expense)}</li>
              {summary.totalsMinor.refund > 0 && <li>Paid back {formatINR(summary.totalsMinor.refund)}</li>}
              {summary.totalsMinor.income > 0 && <li>Income {formatINR(summary.totalsMinor.income)}</li>}
              {summary.totalsMinor.savings > 0 && <li>Saved {formatINR(summary.totalsMinor.savings)}</li>}
              {preview.plan.newTracks.length > 0 && (
                <li>
                  New tracks: {preview.plan.newTracks.map((t) => t.name).join(', ')}. Change a
                  track&rsquo;s type on Home afterwards - Rent, say, to a commitment.
                </li>
              )}
              {preview.plan.newCategories.length > 0 && (
                <li>New categories: {preview.plan.newCategories.join(', ')}</li>
              )}
            </ul>
          )}

          {preview.problems.length > 0 && (
            <div className="rounded-field border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
              <p className="m-0 font-bold">
                {preview.problems.length} row{preview.problems.length === 1 ? '' : 's'} will be left out:
              </p>
              <ul className="m-0 mt-1 pl-5">
                {preview.problems.slice(0, SHOWN_PROBLEMS).map((p) => (
                  <li key={p.line}>
                    Line {p.line}: {p.message}
                  </li>
                ))}
                {preview.problems.length > SHOWN_PROBLEMS && (
                  <li>…and {preview.problems.length - SHOWN_PROBLEMS} more</li>
                )}
              </ul>
            </div>
          )}

          {importer.importedCount > 0 && summary.count > 0 && (
            <p className="m-0 text-sm font-bold text-danger">
              You have already imported {importer.importedCount} entries. Importing the same file again
              adds them twice.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {summary.count > 0 && (
              <button type="button" className={primaryButton} onClick={confirm} disabled={importer.busy}>
                {importer.busy ? 'Importing…' : `Import ${summary.count} entries`}
              </button>
            )}
            <button type="button" className={linkButton} onClick={() => setPreview(null)} disabled={importer.busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {done && (
        <p role="status" className="mt-4 mb-0 text-sm font-bold text-good">
          {done}
        </p>
      )}
      {importer.error && <p className="mt-4 mb-0 text-sm font-bold text-danger">{importer.error}</p>}

      {importer.importedCount > 0 && !preview && (
        <button type="button" className={`${linkButton} mt-4 -ml-3 block`} onClick={undo} disabled={importer.busy}>
          Remove all {importer.importedCount} imported entries
        </button>
      )}
    </section>
  )
}
