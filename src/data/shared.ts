import { newId, now } from '../core/ids';
import { uniqueName } from '../core/plan';
import type { SharedExercise, SharePayload } from '../core/share';
import type { Exercise, ID, Routine, Workout } from '../core/types';
import { repo } from '.';

/**
 * Adds what a share link carries to this account: exercises are matched to the user's own (same library entry, else
 * same name; a removed one is brought back) or created, workout and routine names are made unique, and a routine
 * keeps its planned days. Returns what was created, to open it.
 */
export async function addShared(payload: SharePayload): Promise<{ routineId: ID | null; workoutIds: ID[] }> {
  const ts = now();
  const exercises = await repo.listExercises();
  const key = (name: string) => name.trim().toLowerCase();

  const resolve = async (shared: SharedExercise): Promise<ID> => {
    const match =
      exercises.find((e) => shared.catalogId && e.catalogId === shared.catalogId) ?? exercises.find((e) => key(e.name) === key(shared.name));
    if (match) {
      if (match.archived) {
        const restored = { ...match, archived: false, updatedAt: ts };
        await repo.saveExercise(restored);
        exercises[exercises.indexOf(match)] = restored;
      }
      return match.id;
    }
    const created: Exercise = {
      id: newId(),
      name: shared.name.trim(),
      kind: shared.kind === 'bodyweight' ? 'bodyweight' : 'weighted',
      muscleGroup: shared.muscleGroup,
      equipment: shared.equipment,
      catalogId: shared.catalogId,
      createdAt: ts,
      updatedAt: ts,
    };
    await repo.saveExercise(created);
    exercises.push(created);
    return created.id;
  };

  const taken: { id: ID; name: string }[] = await repo.listWorkouts();
  const workoutIds: ID[] = [];
  for (const shared of payload.workouts) {
    const slots: Workout['exercises'] = [];
    for (const e of shared.exercises) {
      slots.push({
        id: newId(),
        exerciseId: await resolve(e),
        targetSets: Math.max(1, Math.min(20, Math.round(e.targetSets) || 1)),
        targetReps: String(e.targetReps ?? ''),
        notes: e.notes,
        supersetNext: e.supersetNext,
      });
    }
    const workout: Workout = { id: newId(), name: uniqueName(shared.name || 'Shared workout', taken), notes: shared.notes, exercises: slots, createdAt: ts, updatedAt: ts };
    await repo.saveWorkout(workout);
    taken.push(workout);
    workoutIds.push(workout.id);
  }

  if (!payload.routine) return { routineId: null, workoutIds };
  const days: Routine['days'] = {};
  const every: Record<ID, number> = {};
  const validRepeat = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 30;
  workoutIds.forEach((id, i) => {
    const planned = (payload.routine?.days?.[i] ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (planned.length) days[id] = planned;
    const n = payload.routine?.every?.[i];
    if (validRepeat(n)) every[id] = n;
  });
  const routine: Routine = {
    id: newId(),
    name: uniqueName(payload.routine.name || 'Shared routine', await repo.listRoutines()),
    workoutIds,
    days,
    every,
    ...(validRepeat(payload.routine.rotateEvery) ? { rotateEvery: payload.routine.rotateEvery } : {}),
    createdAt: ts,
    updatedAt: ts,
  };
  await repo.saveRoutine(routine);
  return { routineId: routine.id, workoutIds };
}
