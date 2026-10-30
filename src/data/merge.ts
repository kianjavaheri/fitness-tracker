import { combineExercises } from '../core/exerciseMerge';
import { now } from '../core/ids';
import type { Exercise, Session, Workout } from '../core/types';
import { repo } from '.';

/**
 * Merges `others` into `keep`: every logged workout and saved workout that used one of them now uses `keep` (so its
 * history and charts are combined), `keep` gains their notes and links, and they're archived. Resolves to an Undo
 * that puts back exactly what changed.
 */
export async function mergeExercises(keep: Exercise, others: Exercise[]): Promise<() => Promise<void>> {
  const ids = new Set(others.map((o) => o.id));
  const [sessions, workouts] = await Promise.all([repo.listSessions(), repo.listWorkouts()]);
  const touchedSessions: Session[] = sessions.filter((s) => s.entries.some((e) => ids.has(e.exerciseId)));
  const touchedWorkouts: Workout[] = workouts.filter((w) => w.exercises.some((x) => ids.has(x.exerciseId)));

  const ts = now();
  for (const s of touchedSessions) {
    await repo.saveSession({ ...s, entries: s.entries.map((e) => (ids.has(e.exerciseId) ? { ...e, exerciseId: keep.id } : e)) });
  }
  for (const w of touchedWorkouts) {
    await repo.saveWorkout({ ...w, exercises: w.exercises.map((x) => (ids.has(x.exerciseId) ? { ...x, exerciseId: keep.id } : x)), updatedAt: ts });
  }
  await repo.saveExercise({ ...combineExercises(keep, others), updatedAt: ts });
  for (const o of others) await repo.saveExercise({ ...o, archived: true, updatedAt: ts });

  return async () => {
    for (const s of touchedSessions) await repo.saveSession(s);
    for (const w of touchedWorkouts) await repo.saveWorkout({ ...w, updatedAt: now() });
    await repo.saveExercise({ ...keep, updatedAt: now() });
    for (const o of others) await repo.saveExercise({ ...o, updatedAt: now() });
  };
}
