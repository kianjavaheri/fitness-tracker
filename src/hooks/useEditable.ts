import { useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Loads a record once into local state and persists every change immediately.
 * Local state stays the source of truth while editing, so inputs never fight
 * async reloads. `draft` is undefined while loading and null if not found.
 */
export function useEditable<T>(load: () => Promise<T | undefined>, save: (value: T) => Promise<void>, deps: DependencyList) {
  const [draft, setDraft] = useState<T | null | undefined>(undefined);
  const current = useRef<T | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    load().then((v) => {
      if (cancelled) return;
      current.current = v ?? null;
      setDraft(v ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const update = (fn: (value: T) => T) => {
    const cur = current.current;
    if (!cur) return;
    const next = fn(cur);
    current.current = next;
    setDraft(next);
    void save(next);
  };

  return [draft, update] as const;
}
