import { useSyncExternalStore } from 'react'

import { readGeminiKey, subscribeGeminiKey } from '../lib/geminiKey'

/** The current key, or '' when none is set. Updates across components and tabs. */
export function useGeminiKey(): string {
  return useSyncExternalStore(subscribeGeminiKey, readGeminiKey, () => '')
}
