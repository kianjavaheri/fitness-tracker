import { newId, now } from './ids';
import type { ID, Workout } from './types';

// Workout and routine names are unique (ignoring case and surrounding spaces), so "Upper A" always means one thing.

const nameKey = (name: string) => name.trim().toLowerCase();

/** True when another record (not `selfId`) already uses this name. */
export function nameTaken(name: string, others: { id: ID; name: string }[], selfId?: ID): boolean {
  const key = nameKey(name);
  return !!key && others.some((o) => o.id !== selfId && nameKey(o.name) === key);
}

/** `base` if it's free, else the next free numbered name: "Upper A" → "Upper A 2" → "Upper A 3". */
export function uniqueName(base: string, others: { id: ID; name: string }[], selfId?: ID): string {
  const name = base.trim();
  if (!nameTaken(name, others, selfId)) return name;
  const match = /^(.*\S)\s+(\d+)$/.exec(name);
  const stem = match ? match[1] : name;
  for (let n = match ? Number(match[2]) + 1 : 2; ; n++) {
    const candidate = `${stem} ${n}`;
    if (!nameTaken(candidate, others, selfId)) return candidate;
  }
}

/** An independent copy of a workout ("Upper A 2"): same exercises and notes, new ids, its own history from here on. */
export function cloneWorkout(workout: Workout, others: { id: ID; name: string }[]): Workout {
  const ts = now();
  return {
    ...workout,
    id: newId(),
    // The original counts as taken, so "Upper A" → "Upper A 2" and "Upper A 2" → "Upper A 3".
    name: uniqueName(workout.name, [...others, workout]),
    exercises: workout.exercises.map((slot) => ({ ...slot, id: newId() })),
    createdAt: ts,
    updatedAt: ts,
  };
}
