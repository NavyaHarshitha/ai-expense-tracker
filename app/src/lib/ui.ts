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
Chart colours.

Eight categorical hues, validated rather than chosen by eye. Each set was run
through the six checks - lightness band, chroma floor, colourblind separation,
normal-vision separation, and contrast against its own surface - and both modes
pass every adjacent gate. The dark column is the same eight hues re-stepped for
a dark ground, not an automatic lightening: several of the light steps sit at a
lightness that reads as a smudge on near-black.

What the validator caught that eyes would not:
- an all-pink series set is a sequential ramp pretending to be categorical -
  every slice the same hue, so the chart cannot be read without the legend
- blue and violet were 10.9 apart on normal vision, under the 15 floor
- gold and red collide under deuteranopia at delta-E 6, so they are never adjacent
- green sits too close to BOTH teal and gold, so it is held back to slot 6

Order is the safety mechanism, not decoration: adjacent slots are the pairs a
reader actually compares in a stack, a ring or a legend.
*/
export const CHART_COLORS_LIGHT = [
  '#009184', // teal
  '#c9820c', // gold
  '#6b4fd0', // violet
  '#cf3f3f', // red
  '#3d6fa5', // blue
  '#4f9e2f', // green
  '#b83a86', // magenta
  '#96601f', // brown
]

export const CHART_COLORS_DARK = [
  '#17a294',
  '#bd8a18',
  '#8574e8',
  '#e06060',
  '#5183c4',
  '#57a33c',
  '#d4589b',
  '#b87e3e',
]

/**
 * Slices shown before the rest fold into "Other".
 *
 * Not a colour limit - a reading limit. Past six wedges a ring becomes a
 * pattern rather than a comparison, and the eighth slice is always a sliver
 * nobody can act on.
 */
export const MAX_PIE_SLICES = 6

export interface ChartTheme {
  series: string[]
  /** Everything folded into the last slice - deliberately colourless. */
  other: string
  axis: string
  grid: string
  line: string
  surface: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

export function chartTheme(mode: 'light' | 'dark'): ChartTheme {
  return mode === 'dark'
    ? {
        series: CHART_COLORS_DARK,
        other: '#5c6664',
        axis: '#93a09d',
        grid: '#2b3231',
        line: '#17a294',
        // Segments are separated by a ring of the surface colour, so touching
        // wedges never blur into one another.
        surface: '#1a1e1d',
        tooltipBg: '#1a1e1d',
        tooltipBorder: '#414a48',
        tooltipText: '#f2f6f5',
      }
    : {
        series: CHART_COLORS_LIGHT,
        other: '#9aa5a3',
        axis: '#657471',
        grid: '#e3e9e8',
        line: '#0b6f66',
        surface: '#ffffff',
        tooltipBg: '#ffffff',
        tooltipBorder: '#e3e9e8',
        tooltipText: '#111817',
      }
}
