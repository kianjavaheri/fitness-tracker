// Chart colors and time ranges shared by the analytics views.

/** Single-series accent, validated against both surfaces. */
export const ACCENT = { light: '#2a78d6', dark: '#3987e5' };

/**
 * Categorical palette (fixed order, never cycled). Validated for adjacent-pair
 * colour-blind separation in both modes; the dark column is stepped for the dark surface.
 */
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

export const RANGES = [
  { key: '1M', days: 30 },
  { key: '3M', days: 91 },
  { key: '6M', days: 182 },
  { key: '1Y', days: 365 },
  { key: 'All', days: Infinity },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];

export function rangeCutoff(range: RangeKey) {
  const days = RANGES.find((r) => r.key === range)!.days;
  return Date.now() - days * 86_400_000;
}
