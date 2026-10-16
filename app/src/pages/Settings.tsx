import { useState } from 'react'

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
          Voice entry, receipt photos and the written monthly review use Google&rsquo;s Gemini.
          Each person uses their own free key, so it costs you nothing and nobody else&rsquo;s
          usage counts against yours. Everything else in the app works without one.
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
          <ol className="my-6 grid gap-2 pl-5 text-ink-soft">
            <li>
              Open{' '}
              <a
                href={AI_STUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-primary-dark underline"
              >
                Google AI Studio
              </a>{' '}
              and sign in with any Google account.
            </li>
            <li>
              Click <strong>Create API key</strong>. If it asks for a project, let it create one.
            </li>
            <li>Copy the key and paste it below.</li>
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

      <section className={cardPadded}>
        <h2 className={sectionTitle}>Where your key goes</h2>
        <ul className="m-0 grid gap-3 pl-5 text-ink-soft">
          <li>
            It is stored <strong>in this browser only</strong> - not in your account, and not
            on any server of this app. On a new phone or laptop, add it again.
          </li>
          <li>
            It is sent only to Google, with each voice entry, receipt or review you ask for.
          </li>
          <li>
            On Google&rsquo;s free tier, Google may use what you send to improve its products.
            If you would rather not, type expenses in by hand - that never reaches Gemini.
          </li>
          <li>
            You can delete the key at any time in AI Studio, and it stops working everywhere.
          </li>
        </ul>
      </section>
    </div>
  )
}
