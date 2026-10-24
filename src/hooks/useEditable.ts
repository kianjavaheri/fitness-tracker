import { useEffect, useRef, useState, type DependencyList } from 'react';
import { repo } from '../data';

/** Saves stamp these on the way out, so they don't count as someone else's change. */
const VOLATILE_KEYS = new Set(['updatedAt', 'lastActivityAt']);

/** Content of a record regardless of key order (Firestore and local drafts order keys differently). */
function contentKey(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (VOLATILE_KEYS.has(key)) return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
    }
    return v;
  });
}

/** After a local edit, the stored copy may lag behind the draft for this long (debounced or async writes). */
const LOCAL_EDIT_GRACE_MS = 2000;

/**
 * Loads a record into local state and persists every change immediately. Local state stays the source of truth
 * while editing, so inputs never fight async reloads. It still follows changes made elsewhere (another device or
 * tab): when the stored record differs from the draft and nothing was edited here in the last couple of seconds,
 * the draft is replaced, so a page left open can't later save a stale copy over newer data. `draft` is undefined
 * while loading and null if not found (including deleted elsewhere).
 */
export function useEditable<T>(load: () => Promise<T | undefined>, save: (value: T) => Promise<void>, deps: DependencyList) {
  const [draft, setDraft] = useState<T | null | undefined>(undefined);
  const current = useRef<T | null | undefined>(undefined);
  const lastLocalEdit = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    const sync = (initial: boolean) => {
      const call = ++latest;
      load().then((stored) => {
        // Only the newest read counts; reads can finish out of order.
        if (cancelled || call !== latest) return;
        const value = stored ?? null;
        if (!initial) {
          const sinceEdit = Date.now() - lastLocalEdit.current;
          // Too soon after a local edit to trust the stored copy; look again once it has settled, so a change
          // from elsewhere that arrived meanwhile isn't missed.
          if (sinceEdit < LOCAL_EDIT_GRACE_MS) {
            setTimeout(() => sync(false), LOCAL_EDIT_GRACE_MS - sinceEdit + 50);
            return;
          }
          if (contentKey(value) === contentKey(current.current)) return;
        }
        current.current = value;
        setDraft(value);
      });
    };
    lastLocalEdit.current = 0;
    sync(true);
    const unsubscribe = repo.subscribe(() => sync(false));
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const update = (fn: (value: T) => T) => {
    const cur = current.current;
    if (!cur) return;
    const next = fn(cur);
    current.current = next;
    lastLocalEdit.current = Date.now();
    setDraft(next);
    void save(next);
  };

  return [draft, update] as const;
}
