import type { WeightUnit } from './types';

const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

/** Rounds to 0.1 and drops a trailing ".0". */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '—';
  const v = Math.round(fromKg(kg, unit) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Value to show in an editable input; empty string when unset. */
export function weightInputValue(kg: number | null, unit: WeightUnit): string {
  return kg == null ? '' : formatWeight(kg, unit);
}

export function parseWeightInput(raw: string, unit: WeightUnit): number | null {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? toKg(n, unit) : null;
}
