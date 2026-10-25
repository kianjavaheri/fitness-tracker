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
  routine?: { name: string; days?: number[][] };
  workouts: SharedWorkout[];
}

export function shareableWorkout(workout: Workout, exerciseById: Map<string, Exercise>): SharedWorkout {
  return {
    name: workout.name,
    notes: workout.notes || undefined,
    exercises: workout.exercises.flatMap((slot) => {
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
          supersetNext: slot.supersetNext || undefined,
        },
      ];
    }),
  };
}

export function routinePayload(routine: Routine, workouts: Workout[], exerciseById: Map<string, Exercise>): SharePayload {
  const included = routine.workoutIds.map((id) => workouts.find((w) => w.id === id)).filter((w): w is Workout => !!w);
  return {
    v: 1,
    routine: { name: routine.name, days: included.map((w) => routine.days?.[w.id] ?? []) },
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
    const valid =
      payload?.v === 1 &&
      Array.isArray(payload.workouts) &&
      payload.workouts.every((w) => typeof w.name === 'string' && Array.isArray(w.exercises) && w.exercises.every((e) => typeof e.name === 'string'));
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export function shareUrl(payload: SharePayload, origin: string): string {
  return `${origin}/share#${encodeShare(payload)}`;
}
