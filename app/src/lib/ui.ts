/*
Shared class strings for the handful of elements that repeat across pages.

Kept as constants rather than components so the markup stays readable and there
is exactly one place to change a button or a field.
*/

export const card = 'rounded-card border border-line bg-surface shadow-card'

export const cardPadded = `${card} p-6`

export const primaryButton =
  'inline-flex min-h-[46px] items-center justify-center rounded-field bg-primary px-5 py-3 font-extrabold text-surface shadow-button transition hover:bg-primary-dark hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0'

export const secondaryButton =
  'inline-flex min-h-[46px] items-center justify-center rounded-field border border-primary-edge bg-surface px-5 py-3 font-extrabold text-primary-dark transition hover:bg-primary-soft hover:-translate-y-px'

export const linkButton =
  'rounded-full px-3 py-2 font-bold text-muted transition hover:bg-primary-soft hover:text-primary-dark'

export const field =
  'w-full rounded-field border border-line-strong bg-surface px-3.5 py-3 text-ink transition focus:border-primary'

export const fieldLabel = 'mb-2 block font-bold text-ink-soft'

export const sectionTitle = 'mb-5 text-[22px] font-bold text-ink'

export const eyebrow = 'text-sm font-bold uppercase tracking-wider text-muted'

/** Chart series colours, drawn from the pink/lavender palette rather than defaults. */
export const CHART_COLORS = [
  '#db2777',
  '#be185d',
  '#f472b6',
  '#a855f7',
  '#7c3aed',
  '#f9a8d4',
  '#c084fc',
  '#9d174d',
]
