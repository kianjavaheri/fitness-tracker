import { isImportedSession } from './sessions';
import { exerciseLog, isCompletedSet, sessionSummary, type PastSets } from './stats';
import type { ID, Routine, Session } from './types';

/** Local calendar day as "YYYY-MM-DD" (not UTC, so late-evening sessions land on the right day). */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}

export interface DayActivity {
  sets: number;
  sessions: { id: ID; name: string }[];
}

/** Completed sets and session names per local day, from finished sessions (imported baselines don't count). */
export function dailyActivity(sessions: Session[]): Map<string, DayActivity> {
  const days = new Map<string, DayActivity>();
  for (const s of sessions) {
    if (!s.finishedAt || isImportedSession(s)) continue;
    const key = dayKey(new Date(s.startedAt));
    const day = days.get(key) ?? { sets: 0, sessions: [] };
    day.sets += sessionSummary(s).sets;
    day.sessions.push({ id: s.id, name: s.name });
    days.set(key, day);
  }
  return days;
}

/** Workouts planned (via routine weekdays) for a given date, with the routine each came from. */
export function plannedOn(date: Date, routines: Routine[]): { routineId: ID; workoutId: ID }[] {
  return routines.flatMap((r) =>
    r.workoutIds.filter((id) => r.days?.[id]?.includes(date.getDay())).map((workoutId) => ({ routineId: r.id, workoutId })),
  );
}

export interface WeekTotals {
  workouts: number;
  sets: number;
}

/**
 * This week so far (Monday to now) against last week up to the same weekday and time, so a Wednesday isn't compared
 * with a whole week. Imported notes don't count; workouts still in progress do once their sets are logged.
 */
export function weekSoFar(sessions: Session[], now = new Date()): { thisWeek: WeekTotals; lastWeek: WeekTotals } {
  const monday = startOfWeek(now);
  const totals = (from: Date, to: Date): WeekTotals => {
    const inRange = sessions.filter((s) => !isImportedSession(s) && new Date(s.startedAt) >= from && new Date(s.startedAt) <= to);
    return {
      workouts: inRange.filter((s) => sessionSummary(s).sets > 0).length,
      sets: inRange.reduce((n, s) => n + sessionSummary(s).sets, 0),
    };
  };
  return { thisWeek: totals(monday, now), lastWeek: totals(addDays(monday, -7), addDays(now, -7)) };
}

/** Workouts planned this week by a routine's weekdays (each planned day counts once). */
export function plannedThisWeek(routine: Routine | null): number {
  if (!routine) return 0;
  return routine.workoutIds.reduce((n, id) => n + (routine.days?.[id]?.length ?? 0), 0);
}

/**
 * The days an exercise was done (local "YYYY-MM-DD"), each with that day's completed sets: what Analytics' Log table
 * shows and its calendar highlights. Two sessions on one day are combined. `occurrence` is for a workout that has the
 * exercise more than once (heavy sets, then a back-off): only that appearance's sets, in sessions that had it.
 */
export function exerciseDays(exerciseId: ID, sessions: Session[], occurrence?: number): Map<string, PastSets> {
  const days = new Map<string, PastSets>();
  const log =
    occurrence === undefined
      ? exerciseLog(exerciseId, sessions)
      : sessions
          .filter((s) => s.finishedAt)
          .map((s) => ({
            sessionId: s.id,
            date: s.startedAt,
            sets: s.entries.filter((e) => e.exerciseId === exerciseId)[occurrence]?.sets.filter(isCompletedSet) ?? [],
            ...(isImportedSession(s) ? { imported: true } : {}),
          }))
          .filter((p) => p.sets.length > 0)
          .sort((a, b) => b.date.localeCompare(a.date));
  // Newest first, so a day keeps its latest session's id and date, with earlier sets in front.
  for (const p of log) {
    const key = dayKey(new Date(p.date));
    const seen = days.get(key);
    days.set(key, seen ? { ...seen, sets: [...p.sets, ...seen.sets] } : p);
  }
  return days;
}
