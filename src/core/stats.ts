import type { ID, Routine, Session, SetLog } from './types';

/** A set counts toward stats once it has a positive rep count. */
export function isCompletedSet(set: SetLog): boolean {
  return set.reps != null && set.reps > 0;
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

/** One data point per session in which the exercise was performed, oldest first. */
export function exerciseHistory(exerciseId: ID, sessions: Session[]): ExercisePoint[] {
  const points: ExercisePoint[] = [];
  for (const s of sessions) {
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

/** Completed sets (and when) from the most recent other session that included this exercise. */
export function lastPerformanceWithDate(exerciseId: ID, sessions: Session[], excludeSessionId?: ID): PastPerformance | null {
  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const s of sorted) {
    if (s.id === excludeSessionId) continue;
    const sets = s.entries
      .filter((e) => e.exerciseId === exerciseId)
      .flatMap((e) => e.sets)
      .filter(isCompletedSet);
    if (sets.length) return { date: s.startedAt, sets };
  }
  return null;
}

/** Completed sets from the most recent other session that included this exercise. */
export function lastPerformance(exerciseId: ID, sessions: Session[], excludeSessionId?: ID): SetLog[] {
  return lastPerformanceWithDate(exerciseId, sessions, excludeSessionId)?.sets ?? [];
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

  const doneToday = new Set(sessions.filter((s) => sameDay(new Date(s.startedAt), date)).map((s) => s.workoutId));
  const planned = scheduledOn(routine, date).find((id) => !doneToday.has(id));
  if (planned) return planned;

  const last = sessions
    .filter((s) => s.routineId === routine.id && s.workoutId && routine.workoutIds.includes(s.workoutId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!last?.workoutId) return null;
  const idx = routine.workoutIds.indexOf(last.workoutId);
  return routine.workoutIds[(idx + 1) % routine.workoutIds.length];
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

/**
 * The single number used to judge progress on an exercise: estimated 1RM for weighted work,
 * total reps for bodyweight work (or anything logged without weight).
 */
export function progressValue(point: ExercisePoint, bodyweight: boolean): number {
  return bodyweight || point.e1rmKg === 0 ? point.totalReps : point.e1rmKg;
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
    const history = exerciseHistory(exerciseId, sessions).filter((p) => Date.parse(p.date) >= since);
    const base = history.length ? progressValue(history[0], isBodyweight(exerciseId)) : 0;
    const points = history.map((p) => {
      const value = progressValue(p, isBodyweight(exerciseId));
      return { t: Date.parse(p.date), date: p.date, value, pct: base > 0 ? (value / base - 1) * 100 : 0 };
    });
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
    return point ? progressValue(point, isBodyweight(id)) : null;
  };
  const rows = exerciseIds.map((exerciseId) => {
    const current = valueIn(latest, exerciseId);
    const prev = valueIn(previous, exerciseId);
    return { exerciseId, current, previous: prev, pct: current != null && prev ? (current / prev - 1) * 100 : null };
  });
  return { latest, previous, rows };
}
