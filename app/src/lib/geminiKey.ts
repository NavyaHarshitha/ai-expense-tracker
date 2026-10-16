/*
The user's own Gemini API key, kept on this device only.

Each person brings a free key from Google AI Studio, so every model call is made
on THEIR allowance and nobody's usage can cost anyone else anything. The key is
deliberately never written to Firestore: it would then sit in a database the app
owner can read, and sync to every device the account signs in on. Here it lives
in this browser and travels nowhere but to Google.

The trade-off, stated plainly: anything in localStorage is readable by script
running on this origin. An injected script could take it. What it could take is
a free-tier key the user can revoke in one click at aistudio.google.com - which
is why this is acceptable here and would not be for a billed key.
*/

const STORAGE_KEY = 'gemini-api-key'

const listeners = new Set<() => void>()

export function readGeminiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
  } catch {
    // Private windows and blocked site data both throw - treat as "no key".
    return ''
  }
}

export function saveGeminiKey(key: string): void {
  const value = key.trim()
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nowhere to keep it. The caller re-reads and sees no key, which is honest.
  }
  listeners.forEach((fn) => fn())
}

export function clearGeminiKey(): void {
  saveGeminiKey('')
}

/** For useSyncExternalStore: re-render when the key changes here or in another tab. */
export function subscribeGeminiKey(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}
