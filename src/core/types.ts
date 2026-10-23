// Domain model. Plain serializable data only (no classes, no Dates) so the same
// shapes can be stored in IndexedDB today and synced to a backend / native app later.

export type ID = string;
/** ISO-8601 timestamp string. */
export type Timestamp = string;

export type WeightUnit = 'lb' | 'kg';
export type ThemePreference = 'system' | 'light' | 'dark';

/** How an exercise is measured. Bodyweight exercises allow an optional added load. */
export type ExerciseKind = 'weighted' | 'bodyweight';

export interface Exercise {
  id: ID;
  name: string;
  kind: ExerciseKind;
  muscleGroup?: string;
  /** e.g. "barbell", "dumbbell", "cable" — set for exercises added from the built-in library. */
  equipment?: string;
  /** free-exercise-db id when added from the built-in library, so it isn't added twice. */
  catalogId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Soft delete so historic sessions keep their references. */
  archived?: boolean;
}

/** An exercise slot inside a workout template. */
export interface WorkoutExercise {
  id: ID;
  exerciseId: ID;
  targetSets: number;
  /** Free-form so "8-12" or "AMRAP" both work. */
  targetReps: string;
  notes?: string;
}

/** A reusable workout template, e.g. "Push Day". May stand alone or belong to routines. */
export interface Workout {
  id: ID;
  name: string;
  exercises: WorkoutExercise[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** An ordered collection of workouts, e.g. "Push / Pull / Legs". */
export interface Routine {
  id: ID;
  name: string;
  workoutIds: ID[];
  /** Optional weekdays (0 = Sunday … 6 = Saturday) each workout is planned for. */
  days?: Record<ID, number[]>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SetLog {
  id: ID;
  reps: number | null;
  /** Always stored in kilograms; converted at the UI edge. */
  weightKg: number | null;
  done: boolean;
}

export interface SessionEntry {
  id: ID;
  exerciseId: ID;
  sets: SetLog[];
  /** Carried over from the template, if any, for display while logging. */
  targetSets?: number;
  targetReps?: string;
  notes?: string;
}

/** A single gym visit ("check-in"). Either follows a workout template or is freestyle. */
export interface Session {
  id: ID;
  name: string;
  /** Template that seeded this session, or null for a freestyle log. */
  workoutId: ID | null;
  /** Routine the workout was picked from, used to suggest the next workout. */
  routineId: ID | null;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  /** False when logged after the fact (no live timer or duration). Missing means live. */
  live?: boolean;
  entries: SessionEntry[];
  notes?: string;
}

export interface Settings {
  unit: WeightUnit;
  theme: ThemePreference;
}

export const DEFAULT_SETTINGS: Settings = { unit: 'lb', theme: 'system' };

/** Whole-database snapshot used for export / import and future cloud sync. */
export interface Snapshot {
  version: 1;
  exportedAt: Timestamp;
  exercises: Exercise[];
  workouts: Workout[];
  routines: Routine[];
  sessions: Session[];
  settings: Settings;
}
