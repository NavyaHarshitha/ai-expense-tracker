import { describe, expect, it } from 'vitest'

import {
  MAX_IMPORT_ROWS,
  movementFor,
  parseCsv,
  planImport,
  readImport,
  summariseImport,
} from './importCsv'
import { toPaise } from './money'
import type { Category, Track } from './types'

const TODAY = '2026-10-16'
const HEADER = 'date,description,amount,category,type,track'

const file = (...lines: string[]) => [HEADER, ...lines].join('\n')

const category = (name: string): Category => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  archived: false,
  createdFrom: 'seed',
})

describe('parseCsv', () => {
  it('keeps commas and newlines that sit inside quotes', () => {
    expect(parseCsv('a,"b, c","d\ne"\n1,2,3')).toEqual([
      ['a', 'b, c', 'd\ne'],
      ['1', '2', '3'],
    ])
  })

  it('unescapes doubled quotes, and copes with CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿name,note\r\n"say ""hi""",x\r\n')).toEqual([
      ['name', 'note'],
      ['say "hi"', 'x'],
    ])
  })
})

describe('readImport', () => {
  it('reads a well-formed row into paise and a real date', () => {
    const { rows, problems } = readImport(file('2026-07-01,swiggy,311.50,KFood,expense,Daily Expenses'), TODAY)
    expect(problems).toEqual([])
    expect(rows).toEqual([
      {
        line: 2,
        occurredOn: '2026-07-01',
        description: 'swiggy',
        amountMinor: toPaise(311.5),
        categoryName: 'KFood',
        type: 'expense',
        trackName: 'Daily Expenses',
      },
    ])
  })

  it('accepts columns in any order and in any case, with track optional', () => {
    const { rows } = readImport('Amount,TYPE,Date,Category,Description\n"1,200",income,2026-07-06,Salary,pay', TODAY)
    expect(rows[0]).toMatchObject({ amountMinor: toPaise(1200), type: 'income', trackName: 'Daily Expenses' })
  })

  it('files savings under a Savings track unless one is named', () => {
    const { rows } = readImport(file('2026-07-01,,5000,Mutual funds,savings,'), TODAY)
    expect(rows[0]).toMatchObject({ trackName: 'Savings', description: 'Mutual funds' })
  })

  it('refuses a file missing a required column, and says which', () => {
    const { rows, problems } = readImport('date,description,amount\n2026-07-01,x,1', TODAY)
    expect(rows).toEqual([])
    expect(problems[0].message).toBe('Missing columns: category, type.')
  })

  /*
  The cases where a guess would write a wrong figure into the ledger. Each is
  refused with its line number, so it can be fixed in the sheet.
  */
  it.each([
    ['01/07/2026', 'not a date'],
    ['2026-02-30', 'not a date'],
    ['2026-11-01', 'in the future'],
  ])('refuses the date %s (%s)', (date, why) => {
    const { rows, problems } = readImport(file(`${date},x,100,Food,expense,`), TODAY)
    expect(rows).toEqual([])
    expect(problems[0]).toMatchObject({ line: 2 })
    expect(problems[0].message).toContain(why)
  })

  it.each(['0', '', 'abc'])('refuses the amount "%s"', (amount) => {
    const { rows, problems } = readImport(file(`2026-07-01,x,${amount},Food,expense,`), TODAY)
    expect(rows).toEqual([])
    expect(problems).toHaveLength(1)
  })

  it('refuses a negative amount instead of guessing which way it went', () => {
    const { rows, problems } = readImport(file('2026-07-01,x,-50,Food,expense,'), TODAY)
    expect(rows).toEqual([])
    expect(problems[0].message).toContain('refund')
  })

  it('refuses an unknown type rather than defaulting it to an expense', () => {
    const { rows, problems } = readImport(file('2026-07-01,x,100,Food,debit,'), TODAY)
    expect(rows).toEqual([])
    expect(problems[0].message).toContain('expense, income, refund, savings')
  })

  it('keeps good rows when others fail, and ignores blank lines', () => {
    const { rows, problems } = readImport(
      file('2026-07-01,a,100,Food,expense,', ',,,,,', '2026-13-01,b,100,Food,expense,', '2026-07-02,c,50,Food,refund,'),
      TODAY,
    )
    expect(rows.map((r) => r.description)).toEqual(['a', 'c'])
    expect(problems.map((p) => p.line)).toEqual([3])
  })

  it(`refuses more than ${MAX_IMPORT_ROWS} rows outright`, () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => '2026-07-01,x,1,Food,expense,')
    expect(readImport(file(...lines), TODAY).problems[0].message).toContain('split it')
  })
})

describe('movementFor', () => {
  it('records savings as a transfer, never as spending', () => {
    expect(movementFor('savings')).toBe('transfer')
    expect(movementFor('expense')).toBe('expense')
    expect(movementFor('refund')).toBe('refund')
  })
})

describe('planImport', () => {
  const existing: Track[] = [
    { id: 'd', name: 'Daily Expenses', type: 'spending', archived: false },
    { id: 'old', name: 'Old Trip', type: 'project', archived: true },
  ]

  it('creates only what is missing, matching names case-insensitively', () => {
    const { rows } = readImport(
      file(
        '2026-07-01,a,100,food,expense,daily expenses',
        '2026-07-01,b,100,KFood,expense,Rent',
        '2026-07-01,c,100,Mutual funds,savings,Mutual Funds',
        '2026-07-02,d,100,kfood,expense,rent',
      ),
      TODAY,
    )
    expect(planImport(rows, existing, [category('Food')])).toEqual({
      newTracks: [
        { name: 'Rent', type: 'spending' },
        { name: 'Mutual Funds', type: 'goal' },
      ],
      newCategories: ['KFood', 'Mutual funds'],
    })
  })

  it('makes a track a goal if any savings land in it', () => {
    const { rows } = readImport(file('2026-07-01,a,100,X,expense,Pot', '2026-07-02,b,100,X,savings,Pot'), TODAY)
    expect(planImport(rows, [], []).newTracks).toEqual([{ name: 'Pot', type: 'goal' }])
  })

  it('does not reuse an archived track', () => {
    const { rows } = readImport(file('2026-07-01,a,100,X,expense,Old Trip'), TODAY)
    expect(planImport(rows, existing, []).newTracks).toEqual([{ name: 'Old Trip', type: 'spending' }])
  })
})

describe('summariseImport', () => {
  it('totals each type and reports the date range', () => {
    const { rows } = readImport(
      file('2026-07-09,a,100,X,expense,', '2026-07-01,b,40,X,refund,', '2026-07-05,c,10,X,expense,'),
      TODAY,
    )
    expect(summariseImport(rows)).toEqual({
      count: 3,
      from: '2026-07-01',
      to: '2026-07-09',
      totalsMinor: { expense: toPaise(110), income: 0, refund: toPaise(40), savings: 0 },
    })
  })
})
