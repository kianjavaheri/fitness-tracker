import { newId, now } from '../core/ids';
import type { Exercise, ExerciseKind } from '../core/types';

const STARTER: [string, ExerciseKind, string][] = [
  ['Bench Press', 'weighted', 'Chest'],
  ['Incline Dumbbell Press', 'weighted', 'Chest'],
  ['Overhead Press', 'weighted', 'Shoulders'],
  ['Lateral Raise', 'weighted', 'Shoulders'],
  ['Tricep Pushdown', 'weighted', 'Arms'],
  ['Barbell Row', 'weighted', 'Back'],
  ['Lat Pulldown', 'weighted', 'Back'],
  ['Pull-up', 'bodyweight', 'Back'],
  ['Bicep Curl', 'weighted', 'Arms'],
  ['Back Squat', 'weighted', 'Legs'],
  ['Deadlift', 'weighted', 'Legs'],
  ['Romanian Deadlift', 'weighted', 'Legs'],
  ['Leg Press', 'weighted', 'Legs'],
  ['Walking Lunge', 'weighted', 'Legs'],
  ['Push-up', 'bodyweight', 'Chest'],
  ['Dip', 'bodyweight', 'Chest'],
];

export function starterExercises(): Exercise[] {
  const ts = now();
  return STARTER.map(([name, kind, muscleGroup]) => ({
    id: newId(),
    name,
    kind,
    muscleGroup,
    createdAt: ts,
    updatedAt: ts,
  }));
}
