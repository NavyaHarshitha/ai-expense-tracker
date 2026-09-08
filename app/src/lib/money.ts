/*
Money is ALWAYS stored and passed around as an integer count of paise.

Floating point rupees accumulate rounding error across thousands of rows and
every aggregate inherits it - so ₹250.10 is 25010, never 250.1. Conversion to
a decimal happens only at the edges: parsing user input, and formatting for
display.
*/

/**
 * The largest amount any single figure may hold: Rs 10 crore, in paise.
 *
 * Not an opinion about how rich anyone is - it is a precision guard. JavaScript
 * numbers are exact only below 2^53, and "999999999999999" typed into an amount
 * box became 99999999999999900 paise, past that limit, where addition quietly
 * stops being accurate. Every total downstream inherits the error with no
 * symptom until the figures disagree.
 *
 * Rs 10 crore leaves room for ~900,000 maximum-value rows before a SUM could
 * reach 2^53, which no personal ledger will see.
 */
export const MAX_AMOUNT_MINOR = 1_000_000_000_0

/**
 * Parse user input ("250", "250.50", " 1,200 ") into paise.
 *
 * Always returns a finite integer within +/- MAX_AMOUNT_MINOR. Sign is
 * preserved, because some figures legitimately go negative - an overdrawn
 * account, a card in credit - and only transaction amounts must not.
 */
export function toPaise(input: string | number): number {
  const cleaned = typeof input === 'number' ? String(input) : input.replace(/[,\s₹]/g, '')
  const rupees = Number.parseFloat(cleaned)

  if (!Number.isFinite(rupees)) {
    return 0
  }

  // Round rather than truncate: 250.555 -> 25056, not 25055.
  const paise = Math.round(rupees * 100)

  // Clamp instead of rejecting: a typo of one extra zero should cost you a
  // wrong-but-visible figure, not a silently corrupted ledger.
  return Math.max(-MAX_AMOUNT_MINOR, Math.min(MAX_AMOUNT_MINOR, paise))
}

/**
 * Parse user input as a transaction amount: non-negative, finite, bounded.
 *
 * `amountMinor` is documented as always positive, with direction carried by
 * `movement`. A negative amount breaks that invariant and creates money - a
 * "-500 expense" adds Rs 500 to every total that subtracts it.
 */
export function toAmountMinor(input: string | number): number {
  return Math.abs(toPaise(input))
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
  /*
  Never render "₹NaN".

  Intl happily formats NaN and Infinity, so a single corrupt figure used to
  reach the hero card verbatim. Sanitising on the way in from Firestore stops
  the usual cause, but this is the last line: an em dash reads as "no value",
  which is honest, where "₹NaN" reads as a broken app and "₹0" is a lie.
  */
  if (!Number.isFinite(paise)) return '₹—'

  const formatter = opts?.showPaise ? inrWithPaise : inr
  return formatter.format(fromPaise(paise))
}
