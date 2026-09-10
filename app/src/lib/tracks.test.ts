import { describe, expect, it } from 'vitest'

import { toPaise } from './money'
import { definingAmountMinor } from './tracks'
import type { Track } from './types'

const t = (o: Partial<Track>): Track =>
  ({ id: 'x', name: 'T', type: 'spending', archived: false, ...o }) as Track

/*
The planner resolves "the SBI SIP was paid" against these figures, so reading
the wrong field for a type would send it a wrong amount rather than none - a
worse failure than the one this fixed.
*/
describe('definingAmountMinor', () => {
  it('reads the field that defines each type', () => {
    expect(definingAmountMinor(t({ type: 'spending', monthlyLimitMinor: toPaise(10000) }))).toBe(
      toPaise(10000),
    )
    expect(
      definingAmountMinor(t({ type: 'commitment', commitmentAmountMinor: toPaise(6000) })),
    ).toBe(toPaise(6000))
    expect(definingAmountMinor(t({ type: 'goal', targetMinor: toPaise(200000) }))).toBe(
      toPaise(200000),
    )
    expect(definingAmountMinor(t({ type: 'project', budgetMinor: toPaise(40000) }))).toBe(
      toPaise(40000),
    )
  })

  it('does not read a neighbouring type s field', () => {
    // A commitment carrying a stale targetMinor must still report zero, not the target.
    expect(definingAmountMinor(t({ type: 'commitment', targetMinor: toPaise(99999) }))).toBe(0)
    expect(definingAmountMinor(t({ type: 'goal', commitmentAmountMinor: toPaise(99999) }))).toBe(0)
  })

  it('returns 0 when the amount was never set, so nothing is sent to the planner', () => {
    expect(definingAmountMinor(t({ type: 'commitment' }))).toBe(0)
    expect(definingAmountMinor(t({ type: 'goal' }))).toBe(0)
  })
})
