/*
Firebase bootstrap.

Config comes from VITE_* env vars in app/.env.local rather than being inlined,
so the file can be committed and the values swapped per environment.

Note these particular values are NOT secrets - a Firebase web config is meant to
ship to the browser, and per-user isolation is enforced by Firestore security
rules, not by hiding the config. The Gemini key is a different matter entirely:
that stays server-side, in Secret Manager.
*/

import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const missing = required.filter((key) => !import.meta.env[key])

if (missing.length > 0) {
  throw new Error(
    `Missing Firebase config: ${missing.join(', ')}.\n` +
      'Create app/.env.local - see app/.env.local.example.',
  )
}

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

/*
Offline persistence is the point of using Firestore for an expense app: entry
happens in a parking lot with one bar of signal, and writes queue locally until
the connection returns.
*/
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

/** Every document lives under the owning user, so isolation is structural. */
export const userPath = (uid: string, ...rest: string[]) => ['users', uid, ...rest].join('/')
