import type { Exercise, ID, Routine, Session, Settings, Snapshot, Workout } from './types';

/**
 * Storage-agnostic data access. The UI only talks to this interface, so the
 * local IndexedDB implementation can be swapped for a cloud-backed one (e.g.
 * after Google sign-in) or a native SQLite one (Capacitor) without touching pages.
 */
export interface Repository {
  listExercises(): Promise<Exercise[]>;
  saveExercise(exercise: Exercise): Promise<void>;

  listWorkouts(): Promise<Workout[]>;
  getWorkout(id: ID): Promise<Workout | undefined>;
  saveWorkout(workout: Workout): Promise<void>;
  /** Also removes the workout from any routine that references it. */
  deleteWorkout(id: ID): Promise<void>;

  listRoutines(): Promise<Routine[]>;
  getRoutine(id: ID): Promise<Routine | undefined>;
  saveRoutine(routine: Routine): Promise<void>;
  deleteRoutine(id: ID): Promise<void>;

  /** Newest first. */
  listSessions(): Promise<Session[]>;
  getSession(id: ID): Promise<Session | undefined>;
  saveSession(session: Session): Promise<void>;
  deleteSession(id: ID): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  exportSnapshot(): Promise<Snapshot>;
  /** Replaces all data with the snapshot. */
  importSnapshot(snapshot: Snapshot): Promise<void>;
  /** Adds or updates every record in the snapshot, keeping anything not in it. */
  mergeSnapshot(snapshot: Snapshot): Promise<void>;

  /** Called after any write so views can refresh. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;

  /** Sends any writes this repository is holding back (e.g. debounced cloud saves). */
  flush?(): Promise<void>;

  /** Releases listeners / timers when this repository stops being the active one. */
  dispose?(): void;
}
