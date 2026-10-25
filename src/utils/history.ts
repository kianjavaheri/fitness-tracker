/** True when there's an earlier page in this app to go back to (React Router numbers its history entries). */
export function canGoBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

/** A `?from=` path that stays inside the app (a leading `//` would be another site). */
export function safeReturnPath(from: string | null, fallback: string): string {
  return from && from.startsWith('/') && !from.startsWith('//') ? from : fallback;
}
