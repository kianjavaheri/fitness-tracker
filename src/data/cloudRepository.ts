import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { now } from '../core/ids';
import type { Repository } from '../core/repository';
import { DEFAULT_SETTINGS, type Exercise, type ID, type Routine, type Session, type Settings, type Snapshot, type Workout } from '../core/types';

type CollectionName = 'exercises' | 'workouts' | 'routines' | 'sessions';
type RecordOf<C extends CollectionName> = { exercises: Exercise; workouts: Workout; routines: Routine; sessions: Session }[C];

const COLLECTIONS: CollectionName[] = ['exercises', 'workouts', 'routines', 'sessions'];
/** Edits are saved on every keystroke; coalesce them per document before writing. */
const WRITE_DELAY_MS = 500;
/** Firestore allows 500 operations per batch. */
const BATCH_SIZE = 450;

/**
 * Firestore-backed repository for a signed-in user. Data lives under users/{uid}/…
 *
 * Reads come from an in-memory mirror kept current by real-time listeners (so lists are
 * instant and changes from other devices show up live). Writes update the mirror at once
 * and are flushed to Firestore after a short delay, coalescing rapid edits to the same record.
 *
 * Because that delay means a write can still be queued when the tab closes, every queued
 * write is also journaled synchronously to localStorage and replayed on the next start
 * until Firestore confirms it.
 */
export class CloudRepository implements Repository {
  private cache: { [C in CollectionName]: Map<ID, RecordOf<C>> } = {
    exercises: new Map(),
    workouts: new Map(),
    routines: new Map(),
    sessions: new Map(),
  };
  private settings: Settings = DEFAULT_SETTINGS;
  private listeners = new Set<() => void>();
  private unsubscribers: Unsubscribe[] = [];
  private pending = new Map<string, { timer: ReturnType<typeof setTimeout>; data: object }>();
  /** Writes not yet confirmed by Firestore, by key ("sessions/<id>", "meta/settings"). */
  private journal: Record<string, object> = {};
  private ready: Promise<void>;
  private flushOnHide = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  private db: Firestore;
  private uid: string;

  constructor(db: Firestore, uid: string) {
    this.db = db;
    this.uid = uid;
    this.replayJournal();
    const loaded: Promise<void>[] = [];
    for (const name of COLLECTIONS) {
      loaded.push(
        new Promise((resolve, reject) => {
          this.unsubscribers.push(
            onSnapshot(
              this.col(name),
              (snap) => {
                for (const change of snap.docChanges()) {
                  // Our own unsent edit is newer than whatever the server echoes back.
                  if (this.pending.has(`${name}/${change.doc.id}`)) continue;
                  const map = this.cache[name] as Map<ID, unknown>;
                  if (change.type === 'removed') map.delete(change.doc.id);
                  else map.set(change.doc.id, change.doc.data());
                }
                resolve();
                this.emit();
              },
              reject,
            ),
          );
        }),
      );
    }
    loaded.push(
      new Promise((resolve, reject) => {
        this.unsubscribers.push(
          onSnapshot(
            this.settingsDoc(),
            (snap) => {
              if (!this.pending.has('meta/settings')) this.settings = { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) };
              resolve();
              this.emit();
            },
            reject,
          ),
        );
      }),
    );
    this.ready = Promise.all(loaded).then(() => undefined);
    document.addEventListener('visibilitychange', this.flushOnHide);
    window.addEventListener('pagehide', this.flushOnHide);
  }

  // ---------- plumbing ----------

  private col(name: CollectionName) {
    return collection(this.db, 'users', this.uid, name);
  }
  private settingsDoc() {
    return doc(this.db, 'users', this.uid, 'meta', 'settings');
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private ref(key: string) {
    if (key === 'meta/settings') return this.settingsDoc();
    const [name, id] = key.split('/') as [CollectionName, ID];
    return doc(this.col(name), id);
  }

  // ---------- write journal (survives the tab closing mid-delay) ----------

  private journalKey() {
    return `fitness-tracker:pending-writes:${this.uid}`;
  }

  private saveJournal() {
    try {
      if (Object.keys(this.journal).length) localStorage.setItem(this.journalKey(), JSON.stringify(this.journal));
      else localStorage.removeItem(this.journalKey());
    } catch {
      // Storage full or unavailable: the in-memory queue still works while the tab is open.
    }
  }

  private replayJournal() {
    try {
      this.journal = JSON.parse(localStorage.getItem(this.journalKey()) ?? '{}');
    } catch {
      this.journal = {};
    }
    for (const [key, data] of Object.entries(this.journal)) this.send(key, data);
  }

  /** Writes to Firestore and drops the journal entry once the server confirms (unless superseded). */
  private send(key: string, data: object) {
    return setDoc(this.ref(key), data)
      .then(() => {
        if (this.journal[key] === data) {
          delete this.journal[key];
          this.saveJournal();
        }
      })
      .catch((err) => console.error(`Failed to save ${key}`, err));
  }

  private schedule(key: string, data: object) {
    this.journal[key] = data;
    this.saveJournal();
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.send(key, data);
    }, WRITE_DELAY_MS);
    this.pending.set(key, { timer, data });
  }

  /** Hands every queued write to Firestore now (it confirms them in the background). */
  async flush() {
    const writes = [...this.pending.entries()];
    this.pending.clear();
    for (const [, { timer }] of writes) clearTimeout(timer);
    // Don't await server confirmation here: offline it would never resolve.
    writes.forEach(([key, { data }]) => void this.send(key, data));
  }

  dispose() {
    void this.flush();
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.listeners.clear();
    document.removeEventListener('visibilitychange', this.flushOnHide);
    window.removeEventListener('pagehide', this.flushOnHide);
  }

  private async list<C extends CollectionName>(name: C): Promise<RecordOf<C>[]> {
    await this.ready;
    return [...this.cache[name].values()] as RecordOf<C>[];
  }

  private async get<C extends CollectionName>(name: C, id: ID): Promise<RecordOf<C> | undefined> {
    await this.ready;
    return this.cache[name].get(id) as RecordOf<C> | undefined;
  }

  private async put<C extends CollectionName>(name: C, record: RecordOf<C>) {
    (this.cache[name] as Map<ID, RecordOf<C>>).set(record.id, record);
    this.schedule(`${name}/${record.id}`, record);
    this.emit();
  }

  private async remove(name: CollectionName, id: ID) {
    const key = `${name}/${id}`;
    const queued = this.pending.get(key);
    if (queued) clearTimeout(queued.timer);
    this.pending.delete(key);
    delete this.journal[key];
    this.saveJournal();
    this.cache[name].delete(id);
    this.emit();
    // Don't wait for the server: offline, this only resolves once the device reconnects.
    deleteDoc(doc(this.col(name), id)).catch((err) => console.error(`Failed to delete ${key}`, err));
  }

  // ---------- Repository ----------

  async listExercises() {
    return (await this.list('exercises')).sort((a, b) => a.name.localeCompare(b.name));
  }
  saveExercise(exercise: Exercise) {
    return this.put('exercises', exercise);
  }

  async listWorkouts() {
    return (await this.list('workouts')).sort((a, b) => a.name.localeCompare(b.name));
  }
  getWorkout(id: ID) {
    return this.get('workouts', id);
  }
  saveWorkout(workout: Workout) {
    return this.put('workouts', workout);
  }
  async deleteWorkout(id: ID) {
    for (const r of await this.list('routines')) {
      if (r.workoutIds.includes(id)) {
        await this.put('routines', { ...r, workoutIds: r.workoutIds.filter((w) => w !== id), updatedAt: now() });
      }
    }
    await this.remove('workouts', id);
  }

  async listRoutines() {
    return (await this.list('routines')).sort((a, b) => a.name.localeCompare(b.name));
  }
  getRoutine(id: ID) {
    return this.get('routines', id);
  }
  saveRoutine(routine: Routine) {
    return this.put('routines', routine);
  }
  deleteRoutine(id: ID) {
    return this.remove('routines', id);
  }

  async listSessions() {
    return (await this.list('sessions')).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  getSession(id: ID) {
    return this.get('sessions', id);
  }
  saveSession(session: Session) {
    return this.put('sessions', session);
  }
  deleteSession(id: ID) {
    return this.remove('sessions', id);
  }

  async getSettings() {
    await this.ready;
    return this.settings;
  }
  async saveSettings(settings: Settings) {
    this.settings = settings;
    this.schedule('meta/settings', settings);
    this.emit();
  }

  async exportSnapshot(): Promise<Snapshot> {
    const [exercises, workouts, routines, sessions, settings] = await Promise.all([
      this.list('exercises'),
      this.list('workouts'),
      this.list('routines'),
      this.list('sessions'),
      this.getSettings(),
    ]);
    return { version: 1, exportedAt: now(), exercises, workouts, routines, sessions, settings };
  }

  async mergeSnapshot(snapshot: Snapshot) {
    await this.flush();
    const ops: { name: CollectionName; record: { id: ID } }[] = [];
    for (const name of COLLECTIONS) for (const record of (snapshot[name] ?? []) as { id: ID }[]) ops.push({ name, record });
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.db);
      for (const { name, record } of ops.slice(i, i + BATCH_SIZE)) batch.set(doc(this.col(name), record.id), record);
      await batch.commit();
    }
  }

  async importSnapshot(snapshot: Snapshot) {
    if (snapshot?.version !== 1) throw new Error('Unsupported backup file.');
    await this.flush();
    // Delete everything first, then write the backup.
    const existing = await Promise.all(COLLECTIONS.map((name) => getDocs(this.col(name))));
    const refs = existing.flatMap((snap) => snap.docs.map((d) => d.ref));
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.db);
      refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await this.mergeSnapshot(snapshot);
    await setDoc(this.settingsDoc(), { ...DEFAULT_SETTINGS, ...snapshot.settings });
  }
}
