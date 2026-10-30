import { isImportedSession } from './sessions';
import type { ID, Routine, Session, SetLog } from './types';

/** A set counts toward stats once it has a positive rep count (warm-ups never do). */
export function isCompletedSet(set: SetLog): boolean {
  return set.reps != null && set.reps > 0 && !set.warmup;
}

/** Epley estimated one-rep max. */
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export interface ExercisePoint {
  sessionId: ID;
  date: string; // ISO timestamp of the session
  topSetKg: number;
  e1rmKg: number;
  volumeKg: number;
  totalReps: number;
  sets: number;
}

export type MetricKey = 'topSetKg' | 'e1rmKg' | 'volumeKg' | 'totalReps';

/** One data point per finished session in which the exercise was performed, oldest first. */
export function exerciseHistory(exerciseId: ID, sessions: Session[]): ExercisePoint[] {
  const points: ExercisePoint[] = [];
  for (const s of sessions) {
    // A workout still being logged would show up as a half-finished (low) point.
    if (!s.finishedAt) continue;
    const sets = s.entries
      .filter((e) => e.exerciseId === exerciseId)
      .flatMap((e) => e.sets)
      .filter(isCompletedSet);
    if (sets.length === 0) continue;

    let topSetKg = 0;
    let e1rmKg = 0;
    let volumeKg = 0;
    let totalReps = 0;
    for (const set of sets) {
      const w = set.weightKg ?? 0;
      const r = set.reps ?? 0;
      topSetKg = Math.max(topSetKg, w);
      e1rmKg = Math.max(e1rmKg, estimate1RM(w, r));
      volumeKg += w * r;
      totalReps += r;
    }
    points.push({ sessionId: s.id, date: s.startedAt, topSetKg, e1rmKg, volumeKg, totalReps, sets: sets.length });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface PersonalRecords {
  topSetKg: number;
  e1rmKg: number;
  volumeKg: number;
  totalReps: number;
  sessions: number;
}

export function personalRecords(points: ExercisePoint[]): PersonalRecords {
  return points.reduce<PersonalRecords>(
    (pr, p) => ({
      topSetKg: Math.max(pr.topSetKg, p.topSetKg),
      e1rmKg: Math.max(pr.e1rmKg, p.e1rmKg),
      volumeKg: Math.max(pr.volumeKg, p.volumeKg),
      totalReps: Math.max(pr.totalReps, p.totalReps),
      sessions: pr.sessions + 1,
    }),
    { topSetKg: 0, e1rmKg: 0, volumeKg: 0, totalReps: 0, sessions: 0 },
  );
}

export interface PastPerformance {
  date: string;
  sets: SetLog[];
}

export interface LastPerformanceOptions {
  /** The session being logged, which doesn't count as its own "previous". */
  excludeSessionId?: ID;
  /** Only sessions that started before this (the session being logged), so back-dated logs look further back. */
  before?: string;
  /**
   * Which appearance of the exercise in the session this is (0 = first). With an exercise logged twice in one workout
   * (e.g. heavy sets, then a back-off), each appearance is compared with the same appearance last time.
   */
  occurrence?: number;
}

/**
 * Completed sets (and when) from the most recent earlier session that included this exercise. Real workouts win over
 * sessions saved by "Import from notes", which only fill in when there's nothing else.
 */
export function lastPerformanceWithDate(exerciseId: ID, sessions: Session[], options: LastPerformanceOptions = {}): PastPerformance | null {
  const { excludeSessionId, before, occurrence = 0 } = options;
  const earlier = sessions
    .filter((s) => s.id !== excludeSessionId && (!before || s.startedAt < before))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const ordered = [...earlier.filter((s) => !isImportedSession(s)), ...earlier.filter(isImportedSession)];
  for (const s of ordered) {
    // The same appearance as last time, counting skipped ones, so a skipped heavy slot doesn't hand its place to the
    // back-off sets; a skipped one looks further back.
    const entries = s.entries.filter((e) => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;
    const entry = entries[Math.min(occurrence, entries.length - 1)];
    if (!entry.sets.some(isCompletedSet)) continue;
    return { date: s.startedAt, sets: entry.sets.filter(isCompletedSet) };
  }
  return null;
}

/** Completed sets from the most recent earlier session that included this exercise. */
export function lastPerformance(exerciseId: ID, sessions: Session[], options: LastPerformanceOptions = {}): SetLog[] {
  return lastPerformanceWithDate(exerciseId, sessions, options)?.sets ?? [];
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Workouts trained on the given day (imported notes don't count: they aren't a day you trained). */
export function doneOn(sessions: Session[], date = new Date()): Set<ID | null> {
  return new Set(sessions.filter((s) => !isImportedSession(s) && sameDay(new Date(s.startedAt), date)).map((s) => s.workoutId));
}

/** Planned for today and not done yet, which is when a workout earns the "Today" badge. */
export function plannedToday(routine: Routine, workoutId: ID, sessions: Session[], date = new Date()): boolean {
  return scheduledOn(routine, date).includes(workoutId) && !doneOn(sessions, date).has(workoutId);
}

/** Workouts in the routine planned for the given date's weekday. */
export function scheduledOn(routine: Routine, date = new Date()): ID[] {
  return routine.workoutIds.filter((id) => routine.days?.[id]?.includes(date.getDay()));
}

/**
 * Suggested workout from a routine: one planned for today that hasn't been done yet,
 * otherwise the one after the most recently done (wrapping around). Null when there's
 * no basis for a suggestion (nothing planned today and nothing done from this routine yet).
 */
export function nextWorkoutInRoutine(routine: Routine, sessions: Session[], date = new Date()): ID | null {
  if (routine.workoutIds.length === 0) return null;

  const doneToday = doneOn(sessions, date);
  const planned = scheduledOn(routine, date).find((id) => !doneToday.has(id));
  if (planned) return planned;

  const last = sessions
    .filter((s) => s.routineId === routine.id && s.workoutId && routine.workoutIds.includes(s.workoutId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last?.workoutId) return null;
  const idx = routine.workoutIds.indexOf(last.workoutId);
  return routine.workoutIds[(idx + 1) % routine.workoutIds.length];
}

/**
 * The routine being followed: the one picked in settings, or the only routine if there's just one. With several
 * and none picked there's no basis to choose, so null (planned days would otherwise overlap).
 */
export function followedRoutine(routines: Routine[], activeRoutineId: ID | null | undefined): Routine | null {
  return routines.find((r) => r.id === activeRoutineId) ?? (routines.length === 1 ? routines[0] : null);
}

/** Routines that contain the given workout. */
export function routinesContaining(workoutId: ID, routines: Routine[]): Routine[] {
  return routines.filter((r) => r.workoutIds.includes(workoutId));
}

export function sessionSummary(session: Session) {
  let sets = 0;
  let volumeKg = 0;
  for (const e of session.entries) {
    for (const set of e.sets) {
      if (!isCompletedSet(set)) continue;
      sets += 1;
      volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0);
    }
  }
  const exercises = session.entries.filter((e) => e.sets.some(isCompletedSet)).length;
  return { sets, volumeKg, exercises };
}

export type ProgressMode = 'e1rm' | 'reps';

/**
 * How progress is judged for an exercise, decided once for its whole history so one chart never mixes units:
 * total reps for bodyweight exercises or ones never logged with weight, otherwise estimated 1RM.
 */
export function progressMode(points: ExercisePoint[], bodyweight: boolean): ProgressMode {
  return bodyweight || points.every((p) => p.e1rmKg === 0) ? 'reps' : 'e1rm';
}

/** The single number for one session in that mode; null for a session logged without weight in e1RM mode. */
export function progressValue(point: ExercisePoint, mode: ProgressMode): number | null {
  if (mode === 'reps') return point.totalReps;
  return point.e1rmKg > 0 ? point.e1rmKg : null;
}

export interface ProgressSeries {
  exerciseId: ID;
  points: { t: number; date: string; value: number; pct: number }[];
  /** % change from the first to the latest point (0 with a single point). */
  change: number;
}

/**
 * Each exercise's progress indexed to its first session in the window (first session = 0%),
 * so exercises with very different loads can share one axis.
 */
export function indexedProgress(
  exerciseIds: ID[],
  sessions: Session[],
  isBodyweight: (id: ID) => boolean,
  since = -Infinity,
): ProgressSeries[] {
  return exerciseIds.map((exerciseId) => {
    const all = exerciseHistory(exerciseId, sessions);
    const mode = progressMode(all, isBodyweight(exerciseId));
    const valued = all
      .filter((p) => Date.parse(p.date) >= since)
      .map((p) => ({ p, value: progressValue(p, mode) }))
      .filter((x): x is { p: ExercisePoint; value: number } => x.value != null);
    const base = valued[0]?.value ?? 0;
    const points = valued.map(({ p, value }) => ({ t: Date.parse(p.date), date: p.date, value, pct: base > 0 ? (value / base - 1) * 100 : 0 }));
    return { exerciseId, points, change: points.at(-1)?.pct ?? 0 };
  });
}

export interface SessionComparison {
  exerciseId: ID;
  current: number | null;
  previous: number | null;
  /** % change from previous to current, or null when either is missing. */
  pct: number | null;
}

/** Per exercise, the latest session of a workout compared with the one before it. */
export function compareLastTwoSessions(
  workoutId: ID,
  exerciseIds: ID[],
  sessions: Session[],
  isBodyweight: (id: ID) => boolean,
): { latest: Session | null; previous: Session | null; rows: SessionComparison[] } {
  const done = sessions
    .filter((s) => s.workoutId === workoutId && s.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [latest = null, previous = null] = done;
  const valueIn = (s: Session | null, id: ID) => {
    if (!s) return null;
    const point = exerciseHistory(id, [s])[0];
    return point ? progressValue(point, progressMode(exerciseHistory(id, sessions), isBodyweight(id))) : null;
  };
  const rows = exerciseIds.map((exerciseId) => {
    const current = valueIn(latest, exerciseId);
    const prev = valueIn(previous, exerciseId);
    return { exerciseId, current, previous: prev, pct: current != null && prev ? (current / prev - 1) * 100 : null };
  });
  return { latest, previous, rows };
}

/** One past day of an exercise: its completed sets that session (warm-ups left out), for the "Previous" window. */
export interface PastSets {
  sessionId: ID;
  date: string;
  sets: SetLog[];
  /** Saved by Import from notes: what you'd noted down, not a day you trained, so shown without its date. */
  imported?: boolean;
}

/**
 * Every earlier session's completed sets of an exercise, newest first (both slots if it was done twice). `before`
 * (the open session's start) leaves out ones done after it, for an old or back-dated session.
 */
export function exerciseLog(exerciseId: ID, sessions: Session[], excludeSessionId?: ID, before?: string): PastSets[] {
  return sessions
    .filter((s) => s.id !== excludeSessionId && s.finishedAt && (!before || s.startedAt < before))
    .map((s) => ({
      sessionId: s.id,
      date: s.startedAt,
      sets: s.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter(isCompletedSet)),
      ...(isImportedSession(s) ? { imported: true } : {}),
    }))
    .filter((p) => p.sets.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** A past session, with the completed sets of the exercises asked about (in that session's order). */
export interface PastWorkout {
  sessionId: ID;
  date: string;
  /** That session's name ("Freestyle", "Upper B"), since it may have been a different workout. */
  name: string;
  /** From Import from notes (see PastSets.imported). */
  imported?: boolean;
  exercises: { exerciseId: ID; sets: SetLog[] }[];
}

/**
 * Every earlier session that included any of `exerciseIds`, whatever workout it was, newest first, showing only those
 * exercises: the workout's "Previous" window (incline bench done in a freestyle session still shows up for Upper B).
 */
export function exercisesLog(exerciseIds: ID[], sessions: Session[], excludeSessionId?: ID, before?: string): PastWorkout[] {
  const wanted = new Set(exerciseIds);
  return sessions
    .filter((s) => s.id !== excludeSessionId && s.finishedAt && (!before || s.startedAt < before))
    .map((s) => ({
      sessionId: s.id,
      date: s.startedAt,
      name: s.name,
      ...(isImportedSession(s) ? { imported: true } : {}),
      exercises: s.entries
        .filter((e) => wanted.has(e.exerciseId))
        .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter(isCompletedSet) }))
        .filter((e) => e.sets.length > 0),
    }))
    .filter((p) => p.exercises.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Consecutive sets with the same reps and weight, counted: 8×60, 8×60, 7×60 → [2 × 8 @ 60, 1 × 7 @ 60]. */
export function groupSets(sets: SetLog[]): { count: number; reps: number; weightKg: number | null }[] {
  const groups: { count: number; reps: number; weightKg: number | null }[] = [];
  for (const set of sets) {
    const last = groups.at(-1);
    const weightKg = set.weightKg ?? null;
    if (last && last.reps === set.reps && last.weightKg === weightKg) last.count++;
    else groups.push({ count: 1, reps: set.reps ?? 0, weightKg });
  }
  return groups;
}
