import type { Exercise, WeightUnit } from './types';

/** Standard bar and plates per unit. */
const BAR: Record<WeightUnit, number> = { lb: 45, kg: 20 };
const PLATES: Record<WeightUnit, number[]> = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };

/**
 * Plates for each side of the bar to make `total` (in the display unit), heaviest first. `exact` is false when
 * standard plates can't make it exactly (the rest is left off). Null below the bar's own weight.
 */
export function platesPerSide(total: number, unit: WeightUnit): { plates: number[]; exact: boolean } | null {
  if (!(total >= BAR[unit])) return null;
  let side = (total - BAR[unit]) / 2;
  const plates: number[] = [];
  for (const plate of PLATES[unit]) {
    while (side >= plate - 1e-9) {
      plates.push(plate);
      side -= plate;
    }
  }
  return { plates, exact: side < 1e-6 };
}

/** Readable plate list for a set, e.g. "45 + 25 per side", or null when it doesn't apply. */
export function platesLabel(total: number | null, unit: WeightUnit): string | null {
  if (total == null) return null;
  const result = platesPerSide(total, unit);
  if (!result) return null;
  if (result.plates.length === 0) return `Just the ${BAR[unit]} ${unit} bar`;
  return `${result.exact ? '' : '≈ '}${result.plates.join(' + ')} per side`;
}

/** Whether to offer the plate calculator: library barbell exercises, or names that clearly mean a barbell lift. */
export function isBarbellExercise(exercise: Exercise | undefined): boolean {
  if (!exercise || exercise.kind === 'bodyweight') return false;
  if (exercise.equipment) return exercise.equipment.toLowerCase() === 'barbell';
  const name = exercise.name.toLowerCase();
  if (/dumbbell|\bdb\b|machine|cable|smith|goblet|kettlebell|band/.test(name)) return false;
  return /barbell|\bbb\b|squat|deadlift|bench press|overhead press|military press|barbell row|pendlay|hip thrust|clean|snatch/.test(name);
}
