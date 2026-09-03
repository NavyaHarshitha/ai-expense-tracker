import { useEffect, useState } from 'react'

/**
 * Delay a fast-changing value.
 *
 * Typing "groceries" fires nine renders; without this each one re-filters the
 * whole ledger. The input itself stays instant - only the filtering waits.
 */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
