import type { Exercise } from './types';

/**
 * Cleans up a pasted link: adds https:// when missing and accepts only http(s), so a stored link can never be a
 * `javascript:` URL. Returns null when it isn't a usable web address.
 */
export function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Short label for a stored link: the site, plus the path when it's short enough to help. */
export function linkLabel(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'YouTube video';
    const path = url.pathname.replace(/\/$/, '');
    return path && path.length <= 24 ? `${host}${path}` : host;
  } catch {
    return href;
  }
}

export function hasNotesOrLinks(exercise: Exercise): boolean {
  return !!(exercise.notes?.trim() || exercise.links?.length);
}
