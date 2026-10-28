import Dexie, { type Table } from 'dexie';
import { checkSnapshot } from '../core/backup';
import { now } from '../core/ids';
import type { Repository } from '../core/repository';
import {
  DEFAULT_SETTINGS,
  type Exercise,
  type ID,
  type Routine,
  type Session,
  type Settings,
  type Snapshot,
  type Workout,
} from '../core/types';
import { starterExercises } from './seed';

interface KeyValue {
  key: string;
  value: unknown;
}

class FitnessDB extends Dexie {
  exercises!: Table<Exercise, ID>;
  workouts!: Table<Workout, ID>;
  routines!: Table<Routine, ID>;
  sessions!: Table<Session, ID>;
  kv!: Table<KeyValue, string>;

  constructor() {
    super('fitness-tracker');
    this.version(1).stores({
      exercises: 'id, name',
      workouts: 'id, name',
      routines: 'id, name',
      sessions: 'id, startedAt, workoutId, routineId',
      kv: 'key',
    });
    this.on('populate', (tx) => {
      tx.table('exercises').bulkAdd(starterExercises());
    });
  }
}

/** Local-only implementation backed by IndexedDB (via Dexie). */
export class LocalRepository implements Repository {
  private db = new FitnessDB();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  async listExercises() {
    return (await this.db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }
  async saveExercise(exercise: Exercise) {
    await this.db.exercises.put(exercise);
    this.changed();
  }

  async listWorkouts() {
    return (await this.db.workouts.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }
  getWorkout(id: ID) {
    return this.db.workouts.get(id);
  }
  async saveWorkout(workout: Workout) {
    await this.db.workouts.put(workout);
    this.changed();
  }
  async deleteWorkout(id: ID) {
    await this.db.transaction('rw', this.db.workouts, this.db.routines, async () => {
      await this.db.workouts.delete(id);
      const routines = await this.db.routines.toArray();
      for (const r of routines) {
        if (r.workoutIds.includes(id)) {
          await this.db.routines.put({ ...r, workoutIds: r.workoutIds.filter((w) => w !== id), updatedAt: now() });
        }
      }
    });
    this.changed();
  }

  async listRoutines() {
    return (await this.db.routines.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }
  getRoutine(id: ID) {
    return this.db.routines.get(id);
  }
  async saveRoutine(routine: Routine) {
    await this.db.routines.put(routine);
    this.changed();
  }
  async deleteRoutine(id: ID) {
    await this.db.routines.delete(id);
    this.changed();
  }

  async listSessions() {
    return this.db.sessions.orderBy('startedAt').reverse().toArray();
  }
  getSession(id: ID) {
    return this.db.sessions.get(id);
  }
  async saveSession(session: Session) {
    await this.db.sessions.put(session);
    this.changed();
  }
  async deleteSession(id: ID) {
    await this.db.sessions.delete(id);
    this.changed();
  }

  async getSettings(): Promise<Settings> {
    const row = await this.db.kv.get('settings');
    return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) };
  }
  async saveSettings(settings: Settings) {
    await this.db.kv.put({ key: 'settings', value: settings });
    this.changed();
  }

  async exportSnapshot(): Promise<Snapshot> {
    const [exercises, workouts, routines, sessions, settings] = await Promise.all([
      this.db.exercises.toArray(),
      this.db.workouts.toArray(),
      this.db.routines.toArray(),
      this.db.sessions.toArray(),
      this.getSettings(),
    ]);
    return { version: 1, exportedAt: now(), exercises, workouts, routines, sessions, settings };
  }

  async mergeSnapshot(snapshot: Snapshot) {
    const { db } = this;
    await db.transaction('rw', [db.exercises, db.workouts, db.routines, db.sessions], async () => {
      await db.exercises.bulkPut(snapshot.exercises ?? []);
      await db.workouts.bulkPut(snapshot.workouts ?? []);
      await db.routines.bulkPut(snapshot.routines ?? []);
      await db.sessions.bulkPut(snapshot.sessions ?? []);
    });
    this.changed();
  }

  async importSnapshot(snapshot: Snapshot) {
    checkSnapshot(snapshot);
    const { db } = this;
    await db.transaction('rw', [db.exercises, db.workouts, db.routines, db.sessions, db.kv], async () => {
      await Promise.all([db.exercises.clear(), db.workouts.clear(), db.routines.clear(), db.sessions.clear()]);
      await db.exercises.bulkPut(snapshot.exercises ?? []);
      await db.workouts.bulkPut(snapshot.workouts ?? []);
      await db.routines.bulkPut(snapshot.routines ?? []);
      await db.sessions.bulkPut(snapshot.sessions ?? []);
      await db.kv.put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...snapshot.settings } });
    });
    this.changed();
  }
}
