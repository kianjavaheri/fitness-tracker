import type { Exercise, Routine, Workout } from './types';

/** An exercise as it travels in a share link: by name and library id, so the recipient can match their own. */
export interface SharedExercise {
  name: string;
  catalogId?: string;
  kind: Exercise['kind'];
  muscleGroup?: string;
  equipment?: string;
}

export interface SharedWorkout {
  name: string;
  notes?: string;
  exercises: (SharedExercise & { targetSets: number; targetReps: string; notes?: string; supersetNext?: boolean })[];
}

/** What a share link carries: one workout, or a routine with its workouts and planned days. No history. */
export interface SharePayload {
  v: 1;
  routine?: { name: string; days?: number[][]; every?: (number | null)[]; rotateEvery?: number };
  workouts: SharedWorkout[];
}

export function shareableWorkout(workout: Workout, exerciseById: Map<string, Exercise>): SharedWorkout {
  const slots = workout.exercises;
  const kept = slots.map((slot) => exerciseById.has(slot.exerciseId));
  // A slot whose exercise is gone is left out; the one before it stays linked only if the chain ran through it, so
  // A + (missing) + C stays a superset but A, then (missing) + C doesn't become one.
  const linked = (i: number) => {
    for (let j = i; j < slots.length - 1; j++) {
      if (!slots[j].supersetNext) return false;
      if (kept[j + 1]) return true;
    }
    return false;
  };
  return {
    name: workout.name,
    notes: workout.notes || undefined,
    exercises: slots.flatMap((slot, i) => {
      const e = exerciseById.get(slot.exerciseId);
      if (!e) return [];
      return [
        {
          name: e.name,
          catalogId: e.catalogId,
          kind: e.kind,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          targetSets: slot.targetSets,
          targetReps: slot.targetReps,
          notes: slot.notes || undefined,
          supersetNext: linked(i) || undefined,
        },
      ];
    }),
  };
}

export function routinePayload(routine: Routine, workouts: Workout[], exerciseById: Map<string, Exercise>): SharePayload {
  const included = routine.workoutIds.map((id) => workouts.find((w) => w.id === id)).filter((w): w is Workout => !!w);
  return {
    v: 1,
    routine: {
      name: routine.name,
      days: included.map((w) => routine.days?.[w.id] ?? []),
      ...(routine.rotateEvery ? { rotateEvery: routine.rotateEvery } : {}),
      ...(included.some((w) => routine.every?.[w.id]) ? { every: included.map((w) => routine.every?.[w.id] ?? null) } : {}),
    },
    workouts: included.map((w) => shareableWorkout(w, exerciseById)),
  };
}

// The payload rides in the URL fragment (never sent to a server), as UTF-8 JSON in URL-safe base64.

export function encodeShare(payload: SharePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The payload from a link, or null if it's damaged or not one of ours. */
export function decodeShare(encoded: string): SharePayload | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const payload = JSON.parse(json) as SharePayload;
    const optional = (v: unknown, type: 'string' | 'number') => v === undefined || v === null || typeof v === type;
    const valid =
      payload?.v === 1 &&
      Array.isArray(payload.workouts) &&
      payload.workouts.length > 0 &&
      payload.workouts.every(
        (w) =>
          typeof w?.name === 'string' &&
          optional(w.notes, 'string') &&
          Array.isArray(w.exercises) &&
          w.exercises.every(
            (e) =>
              typeof e?.name === 'string' &&
              optional(e.notes, 'string') &&
              optional(e.targetReps, 'string') &&
              optional(e.targetSets, 'number') &&
              optional(e.catalogId, 'string'),
          ),
      ) &&
      (payload.routine === undefined ||
        (typeof payload.routine?.name === 'string' &&
          (payload.routine.days === undefined || (Array.isArray(payload.routine.days) && payload.routine.days.every((d) => Array.isArray(d))))));
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export function shareUrl(payload: SharePayload, origin: string): string {
  return `${origin}/share#${encodeShare(payload)}`;
}
