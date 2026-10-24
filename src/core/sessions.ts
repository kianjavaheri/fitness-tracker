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
    lastActivityAt: now(),
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
    lastActivityAt: now(),
    entries: workout.exercises.map((we) => ({
      ...newEntry(we.exerciseId, we.targetSets),
      targetSets: we.targetSets,
      targetReps: we.targetReps,
      notes: we.notes,
    })),
  };
}

/**
 * Marks a session finished. Everything planned stays (exercises you skipped are still there when you reopen it);
 * only sets with reps count anywhere (`isCompletedSet`), so skipped ones never show up in stats or "Previous".
 */
export function finalizeSession(session: Session): Session {
  // Sessions logged after the fact have no real duration, so they end when they start.
  const finishedAt = session.finishedAt ?? (session.live === false ? session.startedAt : now());
  return { ...session, finishedAt };
}

/**
 * A finished workout can go live again only on the day it was done, if it was logged live (not after the fact or
 * imported) and nothing else is live. Older ones stay finished: their timer would span days.
 */
export function canResume(session: Session, sessions: Session[], today = new Date()): boolean {
  if (!session.finishedAt || session.live === false || isImportedSession(session)) return false;
  if (sessions.some((s) => !s.finishedAt && s.id !== session.id)) return false;
  const started = new Date(session.startedAt);
  return started.toDateString() === today.toDateString();
}

/** Back to in progress: the timer runs from the original start, and a typed duration is dropped. */
export function resumeSession(session: Session): Session {
  const { durationMinutes: _dropped, ...rest } = session;
  return { ...rest, finishedAt: null, lastActivityAt: now() };
}

/** An open workout with no changes for this long is probably forgotten, so the app asks about it. */
export const FORGOTTEN_AFTER_MS = 3 * 60 * 60 * 1000;

export function lastActivity(session: Session): string {
  return session.lastActivityAt ?? session.startedAt;
}

/** The open workout nothing has changed in for `FORGOTTEN_AFTER_MS`, if any. */
export function forgottenSession(sessions: Session[], at = Date.now()): Session | null {
  return sessions.find((s) => !s.finishedAt && at - Date.parse(lastActivity(s)) >= FORGOTTEN_AFTER_MS) ?? null;
}

/** Exercises with at least one logged set: what a finished session actually did. */
export function loggedEntries(session: Session): SessionEntry[] {
  return session.entries.filter((e) => e.sets.some(isCompletedSet));
}

/** An exercise is done once every one of its sets is checked off. */
export function isEntryDone(entry: SessionEntry): boolean {
  return entry.sets.length > 0 && entry.sets.every((s) => s.done);
}

export function sessionDurationMinutes(session: Session): number | null {
  if (session.durationMinutes !== undefined) return session.durationMinutes;
  if (!session.finishedAt || session.live === false) return null;
  return Math.max(0, Math.round((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60000));
}
