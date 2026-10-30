import { DEFAULT_REPS, DEFAULT_SETS } from '../config';
import { newId, now } from '../core/ids';
import { uniqueName } from '../core/plan';
import type { Exercise, ID, Workout } from '../core/types';
import { repo } from '.';
import { adoptCatalogExercise, type CatalogExercise } from './catalog';

/** One picked exercise: one of yours, a library one (added to yours), or a new one by name. */
export interface PickedExercise {
  name: string;
  own?: Exercise;
  entry?: CatalogExercise;
}

/**
 * Saves a new workout of the picked exercises, in order, with the default sets and reps (`DEFAULT_SETS`,
 * `DEFAULT_REPS`; changed in the workout editor), and adds it to `routineId` if given. Library picks join your
 * exercises (reused if already there) and new names become exercises of their own. Its name is made unique.
 */
export async function saveNewWorkout(name: string, picked: PickedExercise[], routineId?: ID | null): Promise<Workout> {
  const ts = now();
  const exercisesNow = await repo.listExercises();
  const ids: ID[] = [];
  for (const item of picked) {
    if (item.own) ids.push(item.own.id);
    else if (item.entry) {
      const adopted = await adoptCatalogExercise(item.entry, exercisesNow);
      exercisesNow.push(adopted);
      ids.push(adopted.id);
    } else {
      const exercise: Exercise = { id: newId(), name: item.name.trim(), kind: 'weighted', muscleGroup: 'Other', createdAt: ts, updatedAt: ts };
      await repo.saveExercise(exercise);
      exercisesNow.push(exercise);
      ids.push(exercise.id);
    }
  }
  const workout: Workout = {
    id: newId(),
    name: uniqueName(name.trim() || 'New workout', await repo.listWorkouts()),
    exercises: ids.map((exerciseId) => ({ id: newId(), exerciseId, targetSets: DEFAULT_SETS, targetReps: DEFAULT_REPS })),
    createdAt: ts,
    updatedAt: ts,
  };
  await repo.saveWorkout(workout);
  if (routineId) {
    const routine = await repo.getRoutine(routineId);
    if (routine) await repo.saveRoutine({ ...routine, workoutIds: [...routine.workoutIds, workout.id], updatedAt: ts });
  }
  return workout;
}
