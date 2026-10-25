import { isCompletedSet } from './stats';
import type { SetLog, WeightUnit } from './types';
import { fromKg, toKg } from './units';

/** The smallest sensible jump on the usual plates and dumbbells. */
const STEP: Record<WeightUnit, number> = { lb: 5, kg: 2.5 };

/** Top of a rep target: "6-12" → 12, "8" → 8; null for things like "AMRAP". */
export function topOfRange(targetReps: string | undefined): number | null {
  const numbers = (targetReps ?? '').match(/\d+/g)?.map(Number) ?? [];
  return numbers.length ? Math.max(...numbers) : null;
}

/**
 * Double progression: when every working set last time reached the top of the rep range at the same weight, it's
 * time to add a little weight (and start again at the bottom of the range). Returns the suggested weight in kg, or
 * null when there's no clear basis (no target range, unweighted, or not all sets hit the top).
 */
export function suggestedWeightKg(targetReps: string | undefined, last: SetLog[], unit: WeightUnit): number | null {
  const top = topOfRange(targetReps);
  const sets = last.filter(isCompletedSet);
  if (!top || sets.length === 0) return null;
  const weight = sets[0].weightKg;
  if (!weight || sets.some((s) => s.weightKg !== weight || (s.reps ?? 0) < top)) return null;
  // The next round number above what was lifted, in the display unit (135 → 140 lb, 137.5 → 140 lb).
  const current = Math.round(fromKg(weight, unit) * 10) / 10;
  return toKg(Math.floor((current + STEP[unit]) / STEP[unit]) * STEP[unit], unit);
}
