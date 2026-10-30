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
  /** Sticky note shown whenever this exercise is logged (form cues, seat height…). */
  notes?: string;
  /** Reference links (form videos, articles). http(s) only — see `normalizeLink`. */
  links?: string[];
  /**
   * Rest after a set of this exercise, in seconds, wherever it's done; 0 = no automatic rest. Missing: the default in
   * Settings (`restSecondsFor`).
   */
  restSeconds?: number;
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
  /** Done as a superset with the next exercise (alternate sets, rest after the last one). Chains for 3+. */
  supersetNext?: boolean;
}

/** A reusable workout template, e.g. "Push Day". May stand alone or belong to routines. */
export interface Workout {
  id: ID;
  name: string;
  exercises: WorkoutExercise[];
  /** Sticky note shown whenever this workout is logged. */
  notes?: string;
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
  /** A warm-up set: shown and checked off like any set, but left out of stats, "Previous" and totals. */
  warmup?: boolean;
  /** When it was checked off (cleared when unchecked): which exercise you're on, and when an exercise was finished. */
  doneAt?: Timestamp;
}

export interface SessionEntry {
  id: ID;
  exerciseId: ID;
  sets: SetLog[];
  /** Carried over from the template, if any, for display while logging. */
  targetSets?: number;
  targetReps?: string;
  notes?: string;
  /** Copied from the workout: a superset with the next entry. */
  supersetNext?: boolean;
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
  /**
   * Duration typed in by hand, in minutes. Missing: worked out from the timer (live sessions) or none (logged after
   * the fact). null: deliberately cleared, so no duration is shown. Use `sessionDurationMinutes`.
   */
  durationMinutes?: number | null;
  /** When the current rest (started by checking off a set) ends. Saved with the session so it survives a reload. */
  restEndsAt?: Timestamp | null;
  /** Length of the last rest started (the exercise's own), which the bar's Start and Again reuse. */
  restLength?: number;
  /** The rest bar was closed with its ×: it's a small pill in the page instead, and sets don't start rests. */
  restHidden?: boolean;
  /** "Keep going" on the forgotten-workout prompt: delays the next prompt without changing `lastActivityAt`. */
  snoozedAt?: Timestamp;
  /** Last time anything in the session changed; spots a workout left open by mistake. See `forgottenSession`. */
  lastActivityAt?: Timestamp;
  /**
   * Saved by "Import from notes" so "Previous" is filled in: real weights, but not a day you trained, so it's
   * left out of daily activity (heatmap, week strip, "Trained today"). Use `isImportedSession`.
   */
  imported?: boolean;
  /**
   * A finished workout picked back up (`resumeSession`): how it was, so cancelling puts it back instead of deleting a
   * workout that was already logged. Dropped when it's finished again.
   */
  resumedFrom?: { finishedAt: Timestamp; durationMinutes?: number | null; entries: SessionEntry[] };
  entries: SessionEntry[];
  notes?: string;
}

export interface Settings {
  unit: WeightUnit;
  theme: ThemePreference;
  /** The routine being followed: drives "Up next", planned days and check-in badges. See `followedRoutine`. */
  activeRoutineId?: ID | null;
  /** Rest length in seconds, started by checking off a set; 0 = only when started by hand (then 2:00). Missing: `DEFAULT_REST_SECONDS`. */
  restSeconds?: number;
  /** false: no rest timer at all (no bar, no rest lengths on exercises, nothing starts). Missing: on. */
  restTimer?: boolean;
  /** The first-run intro (components/Intro.tsx) was finished or skipped. Synced, so it shows once per account. */
  introDone?: boolean;
}

export const DEFAULT_SETTINGS: Settings = { unit: 'lb', theme: 'system' };
export const DEFAULT_REST_SECONDS = 120;

/** Rest after a set of this exercise: its own length if set, else the Settings default. */
export const restSecondsFor = (exercise: Exercise | undefined, settings: Settings) =>
  exercise?.restSeconds ?? settings.restSeconds ?? DEFAULT_REST_SECONDS;

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
