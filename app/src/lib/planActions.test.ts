import { describe, expect, it } from 'vitest'

import { describe as describeAction, isStructural, normalise, normaliseAll } from './planActions'
import { toPaise } from './money'
import type { Track } from './types'

const existing: Track[] = [
  { id: 'daily', name: 'Daily Expenses', type: 'spending', archived: false, monthlyLimitMinor: toPaise(20000) },
  { id: 'emi', name: 'Home Loan EMI', type: 'commitment', archived: false, commitmentAmountMinor: toPaise(18400), dueDay: 28 },
]

describe('normalise: create_track', () => {
  it('builds a commitment track from the planner output', () => {
    const a = normalise(
      { tool: 'create_track', args: { name: 'Mutual Fund SIP (15th)', type: 'commitment', amount_rupees: 15000, due_day: 15 } },
      existing,
    )
    expect(a).toEqual({
      kind: 'create_track',
      name: 'Mutual Fund SIP (15th)',
      type: 'commitment',
      amountMinor: toPaise(15000),
      dueDay: 15,
      perMonthMinor: undefined,
      locked: undefined,
    })
  })

  it('treats a holding as a goal with the current value', () => {
    const a = normalise(
      { tool: 'create_track', args: { name: 'Mutual Funds', type: 'goal', amount_rupees: 60000 } },
      existing,
    )
    expect(a).toMatchObject({ kind: 'create_track', type: 'goal', amountMinor: toPaise(60000) })
  })

  it('carries the locked flag only for goals', () => {
    expect(
      normalise({ tool: 'create_track', args: { name: 'Emergency', type: 'goal', locked: true } }, existing),
    ).toMatchObject({ locked: true })

    expect(
      normalise({ tool: 'create_track', args: { name: 'Rent', type: 'commitment', locked: true } }, existing),
    ).toMatchObject({ locked: undefined })
  })

  it('rejects a missing name or an unknown type', () => {
    expect(normalise({ tool: 'create_track', args: { type: 'goal' } }, existing)).toBeNull()
    expect(normalise({ tool: 'create_track', args: { name: 'X', type: 'wishlist' } }, existing)).toBeNull()
  })

  it('drops an out-of-range due day rather than writing it', () => {
    expect(
      normalise({ tool: 'create_track', args: { name: 'X', type: 'commitment', due_day: 47 } }, existing),
    ).toMatchObject({ dueDay: undefined })
  })

  it('drops a negative amount', () => {
    expect(
      normalise({ tool: 'create_track', args: { name: 'X', type: 'spending', amount_rupees: -500 } }, existing),
    ).toMatchObject({ amountMinor: undefined })
  })
})

describe('normalise: update_track', () => {
  it('resolves a track name to its id, case insensitively', () => {
    expect(
      normalise({ tool: 'update_track', args: { track_name: 'home loan emi', amount_rupees: 19000 } }, existing),
    ).toMatchObject({ kind: 'update_track', trackId: 'emi', amountMinor: toPaise(19000) })
  })

  it('refuses to act when the name matches nothing', () => {
    // A typo must never silently create a duplicate track.
    expect(normalise({ tool: 'update_track', args: { track_name: 'Home Lone EMI' } }, existing)).toBeNull()
  })
})

describe('normalise: set_monthly_income', () => {
  it('accepts a positive amount', () => {
    expect(normalise({ tool: 'set_monthly_income', args: { rupees: 92000 } }, existing)).toEqual({
      kind: 'set_income',
      amountMinor: toPaise(92000),
    })
  })

  it('rejects zero and nonsense', () => {
    expect(normalise({ tool: 'set_monthly_income', args: { rupees: 0 } }, existing)).toBeNull()
    expect(normalise({ tool: 'set_monthly_income', args: { rupees: 'lots' } }, existing)).toBeNull()
  })
})

describe('normalise: create_expense', () => {
  it('defaults method and movement when unstated', () => {
    expect(
      normalise({ tool: 'create_expense', args: { amount_rupees: 250, description: 'lunch' } }, existing),
    ).toMatchObject({ paymentMethod: 'upi', movement: 'expense', category: 'Other' })
  })

  it('rejects a non-positive amount', () => {
    expect(normalise({ tool: 'create_expense', args: { amount_rupees: 0, description: 'x' } }, existing)).toBeNull()
  })

  it('ignores a malformed date instead of writing it', () => {
    expect(
      normalise({ tool: 'create_expense', args: { amount_rupees: 10, description: 'x', occurred_on: 'yesterday' } }, existing),
    ).toMatchObject({ occurredOn: undefined })
  })
})

describe('normaliseAll', () => {
  it('drops unknown tools and keeps the rest', () => {
    const out = normaliseAll(
      [
        { tool: 'create_track', args: { name: 'A', type: 'goal' } },
        { tool: 'delete_everything', args: {} },
        { tool: 'set_monthly_income', args: { rupees: 5000 } },
      ],
      existing,
    )
    expect(out).toHaveLength(2)
    expect(out.map((a) => a.kind)).toEqual(['create_track', 'set_income'])
  })

  it('handles the full mutual-funds instruction', () => {
    const out = normaliseAll(
      [
        { tool: 'create_track', args: { name: 'Mutual Funds', type: 'goal', amount_rupees: 60000 } },
        { tool: 'create_track', args: { name: 'Mutual Fund SIP (15th)', type: 'commitment', amount_rupees: 15000, due_day: 15 } },
        { tool: 'create_track', args: { name: 'Mutual Fund SIP (6th)', type: 'commitment', amount_rupees: 10000, due_day: 6 } },
      ],
      existing,
    )
    expect(out).toHaveLength(3)
    expect(out.every(isStructural)).toBe(true)
  })
})

describe('isStructural', () => {
  it('separates budget structure from recording money', () => {
    expect(isStructural({ kind: 'set_income', amountMinor: 1 })).toBe(true)
    expect(
      isStructural({
        kind: 'create_expense', amountMinor: 1, description: 'x', category: 'Food',
        paymentMethod: 'upi', movement: 'expense',
      }),
    ).toBe(false)
  })
})

describe('describe', () => {
  it('says exactly what will be written', () => {
    const text = describeAction({
      kind: 'create_track', name: 'Mutual Fund SIP (15th)', type: 'commitment',
      amountMinor: toPaise(15000), dueDay: 15,
    })
    expect(text).toContain('Mutual Fund SIP (15th)')
    expect(text).toContain('15,000')
    expect(text).toContain('15th')
  })

  it('uses correct ordinals', () => {
    const on = (d: number) =>
      describeAction({ kind: 'create_track', name: 'X', type: 'commitment', dueDay: d })
    expect(on(1)).toContain('1st')
    expect(on(2)).toContain('2nd')
    expect(on(3)).toContain('3rd')
    expect(on(4)).toContain('4th')
    expect(on(11)).toContain('11th')
    expect(on(21)).toContain('21st')
  })

  it('names a locked goal as locked', () => {
    expect(
      describeAction({ kind: 'create_track', name: 'Emergency Fund', type: 'goal', locked: true }),
    ).toContain('locked')
  })
})
