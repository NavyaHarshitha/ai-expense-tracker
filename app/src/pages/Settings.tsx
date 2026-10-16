import { useState } from 'react'

import { useApp } from '../App'
import { ImportPanel } from '../components/ImportPanel'
import { useGeminiKey } from '../hooks/useGeminiKey'
import { ApiError, generate } from '../lib/gemini'
import { clearGeminiKey, saveGeminiKey } from '../lib/geminiKey'
import { cardPadded, field, fieldLabel, linkButton, primaryButton, sectionTitle } from '../lib/ui'

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey'

/** The cheapest call that proves a key works: a one-word reply. */
const PROBE = { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }] }

/** Shows the end of a key, so it can be recognised without being displayed. */
function masked(key: string): string {
  return `••••••••${key.slice(-4)}`
}

/*
Where each person adds their own free Gemini key.

The key is checked with one tiny call BEFORE it is saved. A mistyped key saved
silently would surface later as a failed voice entry, far from the place it can
be fixed. Only a definite rejection blocks saving: if the user is merely over
their limit, or Gemini is down, the key itself may be fine.
*/
export function Settings() {
  const { uid, tracks, categories, transactions } = useApp()
  const saved = useGeminiKey()
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const key = draft.trim()
    if (!key || checking) return

    setChecking(true)
    setMessage(null)
    try {
      await generate(key, PROBE)
      saveGeminiKey(key)
      setDraft('')
      setMessage({ tone: 'good', text: 'Key works. Voice, receipts and the monthly review are on.' })
    } catch (err) {
      if (err instanceof ApiError && err.code !== 'bad_key' && err.code !== 'input') {
        saveGeminiKey(key)
        setDraft('')
        setMessage({ tone: 'good', text: `Key saved, but it could not be checked just now: ${err.message}` })
      } else {
        setMessage({
          tone: 'danger',
          text: 'Gemini did not accept that key. Copy it again from AI Studio - the whole thing, no spaces.',
        })
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-8">
      <section className={cardPadded}>
        <h1 className={sectionTitle}>Your Gemini key</h1>

        <p className="mt-0 text-ink-soft">
          Voice entry, receipt photos and the Dashboard review need a free Gemini key.
        </p>

        {saved ? (
          <div className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-field bg-good-soft px-4 py-3">
            <span className="font-bold text-good">
              Key saved on this device <span className="tnum font-normal">{masked(saved)}</span>
            </span>
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                clearGeminiKey()
                setMessage(null)
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <ol className="my-6 grid list-decimal gap-2 pl-5 text-ink-soft">
            <li>
              Open{' '}
              <a
                href={AI_STUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-primary-dark underline"
              >
                Google AI Studio
              </a>
              .
            </li>
            <li>
              Click <strong>Create API key</strong>.
            </li>
            <li>Copy it and paste it below.</li>
          </ol>
        )}

        <form className="grid gap-3" onSubmit={save}>
          <label className={fieldLabel} htmlFor="gemini-key">
            {saved ? 'Replace with a different key' : 'API key'}
          </label>
          <input
            id="gemini-key"
            className={field}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your key"
          />
          <button
            type="submit"
            className={`${primaryButton} justify-self-start`}
            disabled={checking || draft.trim() === ''}
          >
            {checking ? 'Checking…' : 'Check and save'}
          </button>
        </form>

        {message && (
          <p
            role="status"
            className={`mt-4 mb-0 text-sm font-bold ${message.tone === 'good' ? 'text-good' : 'text-danger'}`}
          >
            {message.text}
          </p>
        )}
      </section>

      <ImportPanel uid={uid} tracks={tracks} categories={categories} transactions={transactions} />

      <section className={cardPadded}>
        <h2 className={sectionTitle}>Good to know</h2>
        <ul className="m-0 grid list-disc gap-2 pl-5 text-ink-soft">
          <li>Your key is stored only in this browser. On a new device, add it again.</li>
          <li>On the free tier, Google may use your requests to improve its products.</li>
          <li>Prefer not to? Skip the key and type expenses in by hand.</li>
          <li>You can delete the key anytime in AI Studio.</li>
        </ul>
      </section>
    </div>
  )
}
