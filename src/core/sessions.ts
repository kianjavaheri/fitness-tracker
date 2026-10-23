import { newId, now } from './ids';
import { isCompletedSet } from './stats';
import type { ID, Session, SessionEntry, SetLog, Workout } from './types';

/** Note on sessions saved by "Import from notes"; also identifies ones saved before the `imported` flag existed. */
export const IMPORTED_SESSION_NOTE = 'Imported from notes';

export function isImportedSession(session: Session): boolean {
  return session.imported === true || session.notes === IMPORTED_SESSION_NOTE;
}

export function emptySet(): SetLog {
  return { id: newId(), reps: null, weightKg: null, done: false };
}

export function newEntry(exerciseId: ID, setCount = 1): SessionEntry {
  return { id: newId(), exerciseId, sets: Array.from({ length: Math.max(1, setCount) }, emptySet) };
}

/** When to log: live (now, with a timer) or after the fact at a chosen time. */
export interface LogTiming {
  live: boolean;
  startedAt?: string;
}

export function createFreestyleSession(timing: LogTiming = { live: true }): Session {
  return {
    id: newId(),
    name: 'Freestyle',
    workoutId: null,
    routineId: null,
    startedAt: timing.startedAt ?? now(),
    finishedAt: null,
    live: timing.live,
    entries: [],
  };
}

export function createSessionFromWorkout(workout: Workout, routineId: ID | null, timing: LogTiming = { live: true }): Session {
  return {
    id: newId(),
    name: workout.name,
    workoutId: workout.id,
    routineId,
    startedAt: timing.startedAt ?? now(),
    finishedAt: null,
    live: timing.live,
    entries: workout.exercises.map((we) => ({
      ...newEntry(we.exerciseId, we.targetSets),
      targetSets: we.targetSets,
      targetReps: we.targetReps,
      notes: we.notes,
    })),
  };
}

/** Drops sets that were never filled in, then exercises left with no sets. */
export function finalizeSession(session: Session): Session {
  const entries = session.entries
    .map((e) => ({ ...e, sets: e.sets.filter(isCompletedSet) }))
    .filter((e) => e.sets.length > 0);
  // Sessions logged after the fact have no real duration, so they end when they start.
  const finishedAt = session.finishedAt ?? (session.live === false ? session.startedAt : now());
  return { ...session, entries, finishedAt };
}

export function sessionDurationMinutes(session: Session): number | null {
  if (!session.finishedAt || session.live === false) return null;
  return Math.max(0, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60000));
}
