/** True when there's an earlier page in this app to go back to (React Router numbers its history entries). */
export function canGoBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

/**
 * A `?from=` path that stays inside the app. Browsers read `//host`, `/\host` and `/<tab>/host` all as another site,
 * so backslashes and control characters are refused too.
 */
export function safeReturnPath(from: string | null, fallback: string): string {
  const odd = (c: string) => c === '\\' || c.charCodeAt(0) < 32;
  return from && from.startsWith('/') && from[1] !== '/' && ![...from].some(odd) ? from : fallback;
}
