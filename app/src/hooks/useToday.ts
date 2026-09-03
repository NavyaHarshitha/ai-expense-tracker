import { useEffect, useMemo, useState } from 'react'

/*
Today, as a value that actually changes when the day does.

`new Date()` inside a useMemo whose deps are [income, tracks, transactions] never
re-evaluates on a date change - nothing invalidates it. A phone left on the
dashboard at 23:50 on 30 September still showed daysRemaining = 1 the next
morning, so the hero read the entire remaining pool as spendable "today": on
Navya's numbers, Rs 44,400 instead of Rs 1,432. Thirty-one times too high, at the
one boundary where the error is largest, and erring toward "go ahead and spend".

Three triggers, because none alone is sufficient:
- a timer aimed at the next local midnight (handles a page left open)
- visibilitychange (a phone that slept through midnight fires no timer on time)
- focus (a desktop tab returned to after hours)
*/

function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function useToday(): Date {
  const [dayKey, setDayKey] = useState(() => localDayKey(new Date()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const sync = () => setDayKey(localDayKey(new Date()))

    const scheduleMidnight = () => {
      const now = new Date()
      // A few seconds past midnight, so the clock has definitely rolled over.
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        5,
      )
      timer = setTimeout(() => {
        sync()
        scheduleMidnight()
      }, nextMidnight.getTime() - now.getTime())
    }

    scheduleMidnight()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  /*
  Midnight of the current local day. Every consumer only reads
  getFullYear/getMonth/getDate, so pinning the time makes this a STABLE memo
  dependency - it changes exactly once per day rather than on every render.
  */
  return useMemo(() => new Date(`${dayKey}T00:00:00`), [dayKey])
}

/** The same day key, for sending the client's real date to the server. */
export function todayKey(): string {
  return localDayKey(new Date())
}
