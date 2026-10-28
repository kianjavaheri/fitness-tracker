import type { Snapshot } from './types';

const LISTS = ['exercises', 'workouts', 'routines', 'sessions'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a backup before anything is replaced, throwing a readable error if it isn't one. Restoring deletes whatever
 * the backup lacks, so a file missing a list (or with the lists under other names) must not get that far.
 */
export function checkSnapshot(value: unknown): asserts value is Snapshot {
  if (!isObject(value) || value.version !== 1) throw new Error("That file isn't a backup from this app.");
  for (const name of LISTS) {
    const list = value[name];
    if (!Array.isArray(list)) throw new Error(`This backup has no ${name} list, so it was not restored.`);
    const ok = list.every((r) => {
      if (!isObject(r) || typeof r.id !== 'string' || !r.id || r.id.includes('/')) return false;
      if (name === 'sessions') return typeof r.startedAt === 'string' && Array.isArray(r.entries);
      if (name === 'workouts') return typeof r.name === 'string' && Array.isArray(r.exercises);
      if (name === 'routines') return typeof r.name === 'string' && Array.isArray(r.workoutIds);
      return typeof r.name === 'string';
    });
    if (!ok) throw new Error(`Some ${name} in this backup are incomplete, so it was not restored.`);
  }
  if (value.settings !== undefined && !isObject(value.settings)) throw new Error("This backup's settings are unreadable, so it was not restored.");
}
