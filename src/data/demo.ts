import { newId } from '../core/ids';
import { createSessionFromWorkout, finalizeSession } from '../core/sessions';
import { DEFAULT_SETTINGS, type Exercise, type Routine, type Session, type Snapshot, type Workout } from '../core/types';
import { toKg } from '../core/units';
import { starterExercises } from './seed';

/** Dev-only: builds a Push/Pull/Legs routine with ~10 weeks of progressing history. */
export function demoSnapshot(): Snapshot {
  const exercises: Exercise[] = starterExercises();
  const ex = (name: string) => exercises.find((e) => e.name === name)!.id;
  const ts = new Date().toISOString();

  const workout = (name: string, names: [string, number, string][]): Workout => ({
    id: newId(),
    name,
    createdAt: ts,
    updatedAt: ts,
    exercises: names.map(([n, targetSets, targetReps]) => ({ id: newId(), exerciseId: ex(n), targetSets, targetReps })),
  });

  const push = workout('Push', [['Bench Press', 3, '6-12'], ['Overhead Press', 3, '6-10'], ['Lateral Raise', 3, '12-15'], ['Tricep Pushdown', 3, '10-12']]);
  const pull = workout('Pull', [['Barbell Row', 3, '6-10'], ['Pull-up', 3, 'AMRAP'], ['Lat Pulldown', 3, '10-12'], ['Bicep Curl', 3, '10-12']]);
  const legs = workout('Legs', [['Back Squat', 3, '5-8'], ['Romanian Deadlift', 3, '8-10'], ['Leg Press', 3, '10-12']]);
  const routine: Routine = { id: newId(), name: 'Push / Pull / Legs', workoutIds: [push.id, pull.id, legs.id], createdAt: ts, updatedAt: ts };

  // Starting weight (lb) and weekly progression per exercise.
  const base: Record<string, [number, number]> = {
    'Bench Press': [155, 2.5], 'Overhead Press': [95, 1.25], 'Lateral Raise': [20, 0.5], 'Tricep Pushdown': [50, 1.5],
    'Barbell Row': [135, 2.5], 'Pull-up': [0, 0], 'Lat Pulldown': [120, 2.5], 'Bicep Curl': [30, 0.75],
    'Back Squat': [205, 5], 'Romanian Deadlift': [165, 3.5], 'Leg Press': [270, 7.5],
  };

  const sessions: Session[] = [];
  const order = [push, pull, legs];
  const day = 86_400_000;
  let t = Date.now() - 72 * day;
  for (let i = 0; t < Date.now() - day; i++) {
    const w = order[i % 3];
    const week = (t - (Date.now() - 72 * day)) / (7 * day);
    const start = new Date(t);
    start.setHours(18, 0, 0, 0);
    const s = createSessionFromWorkout(w, routine.id);
    s.startedAt = start.toISOString();
    s.finishedAt = new Date(start.getTime() + 65 * 60_000).toISOString();
    s.entries = s.entries.map((e) => {
      const name = exercises.find((x) => x.id === e.exerciseId)!.name;
      const [w0, step] = base[name];
      const noise = Math.round(Math.random() * 2 - 1);
      return {
        ...e,
        sets: e.sets.map((_, k) => ({
          id: newId(),
          done: true,
          reps: name === 'Pull-up' ? Math.min(14, 6 + Math.floor(week * 0.7) - k + noise) : 8 - k + (noise > 0 ? 1 : 0),
          weightKg: w0 ? toKg(Math.round((w0 + step * week) / 2.5) * 2.5, 'lb') : null,
        })),
      };
    });
    sessions.push(finalizeSession(s));
    t += (i % 3 === 2 ? 3 : 2) * day; // a realistic, irregular schedule
  }

  return {
    version: 1,
    exportedAt: ts,
    exercises,
    workouts: [push, pull, legs],
    routines: [routine],
    sessions,
    settings: DEFAULT_SETTINGS,
  };
}
