import { newId, now } from '../core/ids';
import type { Exercise, ExerciseKind } from '../core/types';

// Each with its library entry (data/catalog.ts), for its photos and so picking that entry reuses it.
const STARTER: [string, ExerciseKind, string, string][] = [
  ['Bench Press', 'weighted', 'Chest', 'Barbell_Bench_Press_-_Medium_Grip'],
  ['Incline Dumbbell Press', 'weighted', 'Chest', 'Incline_Dumbbell_Press'],
  ['Overhead Press', 'weighted', 'Shoulders', 'Standing_Military_Press'],
  ['Lateral Raise', 'weighted', 'Shoulders', 'Side_Lateral_Raise'],
  ['Tricep Pushdown', 'weighted', 'Arms', 'Triceps_Pushdown'],
  ['Barbell Row', 'weighted', 'Back', 'Bent_Over_Barbell_Row'],
  ['Lat Pulldown', 'weighted', 'Back', 'Wide-Grip_Lat_Pulldown'],
  ['Pull-up', 'bodyweight', 'Back', 'Pullups'],
  ['Bicep Curl', 'weighted', 'Arms', 'Dumbbell_Bicep_Curl'],
  ['Back Squat', 'weighted', 'Legs', 'Barbell_Squat'],
  ['Deadlift', 'weighted', 'Legs', 'Barbell_Deadlift'],
  ['Romanian Deadlift', 'weighted', 'Legs', 'Romanian_Deadlift'],
  ['Leg Press', 'weighted', 'Legs', 'Leg_Press'],
  ['Walking Lunge', 'weighted', 'Legs', 'Barbell_Walking_Lunge'],
  ['Push-up', 'bodyweight', 'Chest', 'Pushups'],
  ['Dip', 'bodyweight', 'Chest', 'Dips_-_Chest_Version'],
];

/**
 * Starter names to their library entries. Starters made before they carried a catalogId still find their photos
 * through this (catalog.ts photoIdFor).
 */
export const STARTER_CATALOG_IDS: ReadonlyMap<string, string> = new Map(STARTER.map(([name, , , id]) => [name.toLowerCase(), id]));

export function starterExercises(): Exercise[] {
  const ts = now();
  return STARTER.map(([name, kind, muscleGroup, catalogId]) => ({
    id: newId(),
    name,
    kind,
    muscleGroup,
    catalogId,
    createdAt: ts,
    updatedAt: ts,
  }));
}
