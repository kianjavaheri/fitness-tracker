import type { Exercise, ID, Session } from './types';

/** Names that only differ in case, spacing or punctuation are the same exercise ("Flat Leg Curl", "flat leg-curl"). */
export const sameNameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Your exercises listed more than once under the same name (archived ones aside), each group's keeper first. */
export function duplicateGroups(exercises: Exercise[], sessions: Session[]): Exercise[][] {
  const byName = new Map<string, Exercise[]>();
  for (const e of exercises) {
    if (e.archived) continue;
    const key = sameNameKey(e.name);
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  return [...byName.values()].filter((g) => g.length > 1).map((g) => byKeeper(g, sessions));
}

/**
 * Which one to keep: the one linked to the library (its photos and details), then the one with the most logged
 * workouts, then the oldest.
 */
export function byKeeper(group: Exercise[], sessions: Session[]): Exercise[] {
  const uses = new Map<ID, number>();
  for (const s of sessions) for (const id of new Set(s.entries.map((e) => e.exerciseId))) uses.set(id, (uses.get(id) ?? 0) + 1);
  return [...group].sort(
    (a, b) =>
      Number(!!b.catalogId) - Number(!!a.catalogId) ||
      (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * The kept exercise with what the others add: their notes (when different) under its own, their links, and a library
 * link or rest length if it had none.
 */
export function combineExercises(keep: Exercise, others: Exercise[]): Exercise {
  const notes = [keep.notes, ...others.map((o) => o.notes)]
    .map((n) => n?.trim())
    .filter((n, i, all): n is string => !!n && all.indexOf(n) === i);
  const links = [...new Set([...(keep.links ?? []), ...others.flatMap((o) => o.links ?? [])])];
  return {
    ...keep,
    notes: notes.length ? notes.join('\n\n') : keep.notes,
    links: links.length ? links : keep.links,
    catalogId: keep.catalogId ?? others.find((o) => o.catalogId)?.catalogId,
    restSeconds: keep.restSeconds ?? others.find((o) => o.restSeconds !== undefined)?.restSeconds,
  };
}
