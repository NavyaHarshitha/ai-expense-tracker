import { useCallback, useEffect, useState } from 'react'

/*
Theme preference, in three states.

"System" is the default and the right one: most people set this once at the OS
level and expect apps to follow. Light and dark are explicit overrides, stamped
as data-theme on the root element so CSS can beat prefers-color-scheme in either
direction.

The resolved value is also returned, because a few things - the charts - need
the actual colour in JavaScript rather than through a CSS variable.
*/

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Private windows and blocked site data both throw - the default is fine.
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow the OS while the choice is "system".
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement

    // No attribute at all for "system", so the media query is what decides.
    if (choice === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', choice)

    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, [choice])

  const resolved: ResolvedTheme =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  /** Cycles system -> light -> dark -> system. */
  const cycle = useCallback(() => {
    setChoice((c) => (c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system'))
  }, [])

  return { choice, resolved, setChoice, cycle }
}
