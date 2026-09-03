/*
Money is ALWAYS stored and passed around as an integer count of paise.

Floating point rupees accumulate rounding error across thousands of rows and
every aggregate inherits it - so ₹250.10 is 25010, never 250.1. Conversion to
a decimal happens only at the edges: parsing user input, and formatting for
display.
*/

/** Parse user input ("250", "250.50", " 1,200 ") into paise. */
export function toPaise(input: string | number): number {
  const cleaned = typeof input === 'number' ? String(input) : input.replace(/[,\s₹]/g, '')
  const rupees = Number.parseFloat(cleaned)

  if (!Number.isFinite(rupees)) {
    return 0
  }

  // Round rather than truncate: 250.555 -> 25056, not 25055.
  return Math.round(rupees * 100)
}

/** Paise -> rupees as a number. Use only for display or charting. */
export function fromPaise(paise: number): number {
  return paise / 100
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrWithPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format paise as Indian rupees with lakh/crore grouping - ₹1,00,000, not ₹100,000.
 * Whole rupees by default, since expense amounts are rarely interesting to the paisa.
 */
export function formatINR(paise: number, opts?: { showPaise?: boolean }): string {
  const formatter = opts?.showPaise ? inrWithPaise : inr
  return formatter.format(fromPaise(paise))
}
