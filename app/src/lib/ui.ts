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

These are warm and earthy on purpose, but only as muted as they can be while
staying legible. Below a chroma of 0.1 a colour reads as grey and stops carrying
identity at all - a first pass at a properly Pinterest-soft set put four of the
eight under that floor. The values here sit just above it: quiet enough to be
easy on the eye, saturated enough to still mean something.

What the validator caught that eyes would not:
- an all-pink series set is a sequential ramp pretending to be categorical -
  every slice the same hue, so the ring cannot be read without the legend
- blue and violet were 10.9 apart on normal vision, under the 15 floor
- gold and red collide under deuteranopia, so they are never adjacent
- sage, dusty blue and warm brown all read as grey until their chroma was raised

Order is the safety mechanism, not decoration: adjacent slots are the pairs a
reader actually compares in a stack, a ring or a legend.
*/
export const CHART_COLORS_LIGHT = [
  '#bd5626', // rust
  '#009184', // teal
  '#a8860a', // gold
  '#8f3f7d', // plum
  '#6d8a12', // olive
  '#3f68ab', // blue
  '#b03f6a', // rose
  '#8a5510', // sienna
]

export const CHART_COLORS_DARK = [
  '#d9743f',
  '#17a294',
  '#b08d15',
  '#b25a9c',
  '#7d9c22',
  '#5d84c4',
  '#cf5f88',
  '#b0721e',
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
        other: '#6b6058',
        axis: '#a19385',
        grid: '#362e28',
        line: '#d9743f',
        // Segments are separated by a ring of the surface colour, so touching
        // wedges never blur into one another.
        surface: '#221d19',
        tooltipBg: '#221d19',
        tooltipBorder: '#4b4037',
        tooltipText: '#f5efe8',
      }
    : {
        series: CHART_COLORS_LIGHT,
        other: '#a89a8c',
        axis: '#8a7d72',
        grid: '#e8ded2',
        line: '#a8552b',
        surface: '#fffdfa',
        tooltipBg: '#fffdfa',
        tooltipBorder: '#e8ded2',
        tooltipText: '#2b2420',
      }
}
