import { describe, expect, it } from 'vitest'

import { categoryNames, checkDuplicate, resolveCategory, slugify } from './categories'
import type { Category } from './types'

const cat = (name: string, over: Partial<Category> = {}): Category => ({
  id: name.toLowerCase(),
  name,
  slug: slugify(name),
  archived: false,
  createdFrom: 'seed',
  ...over,
})

const existing = [cat('Food'), cat('Transport'), cat('Eating Out'), cat('Other')]

describe('slugify', () => {
  it('normalises case, punctuation and spacing', () => {
    expect(slugify('  Eating   Out! ')).toBe('eating out')
    expect(slugify('Food & Drink')).toBe('food drink')
    expect(slugify('FOOD')).toBe('food')
  })

  it('does not strip plurals - Bill and Bills are a warning, not a merge', () => {
    expect(slugify('Bills')).toBe('bills')
    expect(slugify('Bill')).toBe('bill')
  })

  it('returns empty for a name with nothing in it', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})

describe('checkDuplicate', () => {
  it('matches an existing category regardless of case or spacing', () => {
    expect(checkDuplicate('food', existing).exact?.name).toBe('Food')
    expect(checkDuplicate('  EATING  out ', existing).exact?.name).toBe('Eating Out')
  })

  it('matches an alias, so voice does not create a twin', () => {
    const withAlias = [cat('Eating Out', { aliases: ['Restaurants', 'Dining'] })]
    expect(checkDuplicate('restaurants', withAlias).exact?.name).toBe('Eating Out')
  })

  it('flags a plural as similar rather than identical', () => {
    const r = checkDuplicate('Foods', existing)
    expect(r.exact).toBeUndefined()
    expect(r.similar.map((c) => c.name)).toContain('Food')
  })

  it('flags a typo as similar', () => {
    expect(checkDuplicate('Transprot', existing).similar.map((c) => c.name)).toContain('Transport')
  })

  it('flags containment, catching Food vs Fast Food', () => {
    expect(checkDuplicate('Fast Food', existing).similar.map((c) => c.name)).toContain('Food')
  })

  it('allows a genuinely different name through cleanly', () => {
    const r = checkDuplicate('Medical', existing)
    expect(r.exact).toBeUndefined()
    expect(r.similar).toEqual([])
  })

  it('is stricter on short names, where one letter changes the meaning', () => {
    // "Gas" vs "Gym" differ by 2 of 3 letters and are not the same thing.
    const r = checkDuplicate('Gym', [cat('Gas')])
    expect(r.similar).toEqual([])
  })

  it('ignores archived categories - they are meant to be replaceable', () => {
    const r = checkDuplicate('Food', [cat('Food', { archived: true })])
    expect(r.exact).toBeUndefined()
  })

  it('returns nothing for an empty name instead of matching everything', () => {
    expect(checkDuplicate('   ', existing)).toEqual({ similar: [] })
  })
})

describe('resolveCategory', () => {
  it('returns the canonical spelling so the ledger stores one form', () => {
    expect(resolveCategory('FOOD', existing)).toBe('Food')
  })

  it('returns undefined when a new category is genuinely needed', () => {
    expect(resolveCategory('Pets', existing)).toBeUndefined()
  })
})

describe('categoryNames', () => {
  it('is alphabetical with Other last, and excludes archived', () => {
    const list = [cat('Other'), cat('Transport'), cat('Food'), cat('Zoo', { archived: true })]
    expect(categoryNames(list)).toEqual(['Food', 'Transport', 'Other'])
  })
})
