/*
Categories, and the guards that stop them multiplying.

Left unguarded, "Food", "food", "Foods", "Eating" and "Lunch" all end up as
separate categories within a month - especially once voice can create them -
and every breakdown becomes noise. So: a normalised slug blocks exact
duplicates, and a similarity check surfaces near-misses before they are made
rather than asking someone to tidy up later.
*/

import type { Category } from './types'

/** The set a new account starts with, so nobody faces an empty dropdown. */
export const STARTER_CATEGORIES = [
  'Food',
  'Transport',
  'Groceries',
  'Shopping',
  'Bills',
  'Health',
  'Rent',
  'Entertainment',
  'Other',
]

/**
 * Normalise for comparison: lowercase, collapse whitespace, drop punctuation.
 *
 * Deliberately does NOT strip trailing 's' - "Bills" and "Bill" are a
 * near-match to warn about, not the same thing to silently merge, and crude
 * singularisation gets words like "Miscellaneous" wrong.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Levenshtein distance, capped early - we only care about "very close". */
function distance(a: string, b: string, cap = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > cap) return cap + 1

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }

  return prev[b.length]
}

export interface DuplicateCheck {
  /** An existing category with the same slug or a matching alias. */
  exact?: Category
  /** Close enough to be worth asking about, but not identical. */
  similar: Category[]
}

/**
 * Would creating `name` duplicate something that already exists?
 *
 * Exact matches should block. Similar ones should ask - "you already have
 * Eating Out, use that instead?" - because only the person knows whether
 * "Dining" is the same idea or a deliberately separate one.
 */
export function checkDuplicate(name: string, categories: Category[]): DuplicateCheck {
  const slug = slugify(name)
  if (!slug) return { similar: [] }

  const live = categories.filter((c) => !c.archived)

  const exact = live.find(
    (c) => c.slug === slug || (c.aliases ?? []).some((a) => slugify(a) === slug),
  )
  if (exact) return { exact, similar: [] }

  const similar = live.filter((c) => {
    if (c.slug === slug) return false
    // One containing the other catches Food/Fast Food and Rent/House Rent.
    if (c.slug.includes(slug) || slug.includes(c.slug)) return true
    // A typo or a plural.
    return distance(c.slug, slug) <= (slug.length <= 4 ? 1 : 2)
  })

  return { similar }
}

/**
 * Resolve a spoken or typed name onto an existing category.
 *
 * Returns the canonical name so the ledger stores one spelling, or undefined if
 * nothing matches and a new category is genuinely needed.
 */
export function resolveCategory(name: string, categories: Category[]): string | undefined {
  const { exact } = checkDuplicate(name, categories)
  return exact?.name
}

/** Names for a dropdown: live only, alphabetical, with "Other" pushed last. */
export function categoryNames(categories: Category[]): string[] {
  return categories
    .filter((c) => !c.archived)
    .map((c) => c.name)
    .sort((a, b) => {
      if (slugify(a) === 'other') return 1
      if (slugify(b) === 'other') return -1
      return a.localeCompare(b)
    })
}
