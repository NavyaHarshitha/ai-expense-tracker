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

/*
Chart colours, per theme.

Recharts takes colours as props, so it cannot read the CSS variables the rest of
the app follows - these have to be resolved in JavaScript. The dark set is
lifted and desaturated rather than reused: #be185d and #9d174d read as near-black
smudges on a dark ground, and the axis grey has to invert or the labels vanish.
*/
export const CHART_COLORS_LIGHT = [
  '#db2777',
  '#be185d',
  '#f472b6',
  '#a855f7',
  '#7c3aed',
  '#f9a8d4',
  '#c084fc',
  '#9d174d',
]

export const CHART_COLORS_DARK = [
  '#f472b6',
  '#ec4899',
  '#f9a8d4',
  '#c084fc',
  '#a78bfa',
  '#fbcfe8',
  '#d8b4fe',
  '#e879a9',
]

export interface ChartTheme {
  series: string[]
  axis: string
  grid: string
  bar: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

export function chartTheme(mode: 'light' | 'dark'): ChartTheme {
  return mode === 'dark'
    ? {
        series: CHART_COLORS_DARK,
        axis: '#9d95a8',
        grid: '#2e2a38',
        bar: '#f472b6',
        tooltipBg: '#1c1a24',
        tooltipBorder: '#443e52',
        tooltipText: '#f5f3f7',
      }
    : {
        series: CHART_COLORS_LIGHT,
        axis: '#6b7280',
        grid: '#e5e7eb',
        bar: '#db2777',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e5e7eb',
        tooltipText: '#111827',
      }
}
