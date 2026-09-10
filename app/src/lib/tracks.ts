/*
Track helpers shared by the UI and the voice planner.

`definingAmountMinor` lived inside TrackForm, where only the editor could reach
it. The planner needs the same answer - a commitment reported as paid has to be
resolved to the amount already stored for it - and two copies of "which of the
four amount fields matters for this type" is exactly the kind of duplication
that drifts.
*/

import type { Track } from './types'

/** The one amount that defines a track, whichever of the four fields holds it. */
export function definingAmountMinor(track: Track): number {
  switch (track.type) {
    case 'spending':
      return track.monthlyLimitMinor ?? 0
    case 'commitment':
      return track.commitmentAmountMinor ?? 0
    case 'goal':
      return track.targetMinor ?? 0
    case 'project':
      return track.budgetMinor ?? 0
  }
}
