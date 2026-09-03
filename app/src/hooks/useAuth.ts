import { useEffect, useState } from 'react'
import { type User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

import { auth, googleProvider } from '../lib/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        setUser(next)
        setLoading(false)
      }),
    [],
  )

  async function signIn() {
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      // Closing the popup is a normal thing to do, not an error worth showing.
      const code = (e as { code?: string }).code ?? ''
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Could not sign in. Check your connection and try again.')
      }
    }
  }

  return { user, loading, error, signIn, signOut: () => signOut(auth) }
}
