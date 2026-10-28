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
import { checkSnapshot } from '../core/backup';
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
/** After handing a write to Firestore, its own persistent queue has it well within this. */
const HANDOFF_SAFE_MS = 3000;

interface JournalEntry {
  data: object;
  /** When the edit was made (ms); also stored on the document as `_savedAt`. */
  at: number;
  /**
   * Whether the server had the document when the edit was made. A leftover edit to a document the server no longer
   * has was deleted elsewhere since, so it isn't replayed (that would bring it back); a new one still is.
   */
  existed?: boolean;
}

/** Splits the internal save stamp off a stored document. */
function withoutStamp(raw: Record<string, unknown>): { data: Record<string, unknown>; savedAt: number } {
  const { _savedAt, ...data } = raw;
  return { data, savedAt: typeof _savedAt === 'number' ? _savedAt : 0 };
}

/**
 * Firestore-backed repository for a signed-in user. Data lives under users/{uid}/…
 *
 * Reads come from an in-memory mirror kept current by real-time listeners (so lists are
 * instant and changes from other devices show up live). Writes update the mirror at once
 * and are flushed to Firestore after a short delay, coalescing rapid edits to the same record.
 *
 * Because that delay means a write can still be queued when the tab closes, every queued
 * write is also journaled synchronously to localStorage (one entry per document, merged so
 * tabs don't overwrite each other). An entry is cleared once Firestore has it (its own
 * on-device queue takes over a moment after handoff) or confirms it. Leftovers are replayed
 * on the next start, but only when newer than what the server has: every document carries a
 * `_savedAt` stamp (stripped from what the app sees), so an old write can't undo a newer edit
 * made on another device.
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
  /** Writes not yet safely with Firestore, by key ("sessions/<id>", "meta/settings"). */
  private journal: Record<string, JournalEntry> = {};
  /** The server's `_savedAt` per key, to tell whether a leftover journal entry is still the newest. */
  private savedAt = new Map<string, number>();
  /** Documents known to be on the server (not just this device's own unconfirmed write). */
  private onServer = new Set<string>();
  private syncError: string | null = null;
  private ready: Promise<void>;
  /** Resolves once every listener has heard from the server (not just the offline cache), for replaying leftovers. */
  private fromServer: Promise<void>;
  private flushOnHide = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  private db: Firestore;
  private uid: string;

  constructor(db: Firestore, uid: string) {
    this.db = db;
    this.uid = uid;
    this.loadJournal();
    const loaded: Promise<void>[] = [];
    const confirmed: Promise<void>[] = [];
    // Resolved by a listener's first snapshot that came from the server rather than the offline cache.
    const serverDone = () => {
      let done!: () => void;
      confirmed.push(new Promise<void>((resolve) => (done = resolve)));
      return done;
    };
    // A listener error (e.g. rules rejecting a read) keeps the data we have instead of leaving pages blank.
    const failed = (resolve: () => void) => (err: Error) => {
      console.error('Sync stopped', err);
      this.syncError = err.message || 'Sync stopped';
      resolve();
      this.emit();
    };
    for (const name of COLLECTIONS) {
      const heard = serverDone();
      loaded.push(
        new Promise<void>((resolve) => {
          let first = true;
          this.unsubscribers.push(
            onSnapshot(
              this.col(name),
              { includeMetadataChanges: true },
              (snap) => {
                if (!snap.metadata.fromCache) heard();
                for (const change of snap.docChanges({ includeMetadataChanges: true })) {
                  const key = `${name}/${change.doc.id}`;
                  if (change.type === 'removed') this.onServer.delete(key);
                  else if (!change.doc.metadata.hasPendingWrites) this.onServer.add(key);
                }
                const changes = snap.docChanges();
                // Metadata-only updates (cache → server confirmed) change nothing the app sees.
                if (!changes.length && !first) return;
                first = false;
                for (const change of changes) {
                  const key = `${name}/${change.doc.id}`;
                  const map = this.cache[name] as Map<ID, unknown>;
                  if (change.type === 'removed') {
                    this.savedAt.delete(key);
                    if (!this.pending.has(key)) map.delete(change.doc.id);
                    continue;
                  }
                  const { data, savedAt } = withoutStamp(change.doc.data());
                  this.savedAt.set(key, savedAt);
                  // Our own unsent edit is newer than whatever the server echoes back.
                  if (!this.pending.has(key)) map.set(change.doc.id, data);
                }
                resolve();
                this.emit();
              },
              failed(resolve),
            ),
          );
        }),
      );
    }
    const heardSettings = serverDone();
    loaded.push(
      new Promise<void>((resolve) => {
        this.unsubscribers.push(
          onSnapshot(
            this.settingsDoc(),
            { includeMetadataChanges: true },
            (snap) => {
              if (!snap.metadata.fromCache) heardSettings();
              const { data, savedAt } = withoutStamp(snap.data() ?? {});
              this.savedAt.set('meta/settings', savedAt);
              if (!this.pending.has('meta/settings')) this.settings = { ...DEFAULT_SETTINGS, ...(data as Partial<Settings>) };
              resolve();
              this.emit();
            },
            failed(resolve),
          ),
        );
      }),
    );
    this.ready = Promise.all(loaded).then(() => undefined);
    this.fromServer = Promise.all(confirmed).then(() => undefined);
    // Leftover writes are compared with what the server has, so wait until it has answered: the offline cache can be
    // older than an edit made on another device since. Offline that waits, and Firestore would only queue them anyway.
    void this.fromServer.then(() => this.replayJournal());
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

  private readStoredJournal(): Record<string, unknown> {
    try {
      return JSON.parse(localStorage.getItem(this.journalKey()) ?? '{}');
    } catch {
      return {};
    }
  }

  /**
   * Saves one key's entry, merged into what's stored, so other tabs' entries are left alone. Dropping an entry (`at`)
   * leaves a newer one another tab wrote for the same document.
   */
  private persistJournal(key: string, dropped?: number) {
    try {
      const stored = this.readStoredJournal();
      const theirs = stored[key] as Partial<JournalEntry> | undefined;
      if (this.journal[key]) stored[key] = this.journal[key];
      else if (dropped === undefined || !(typeof theirs?.at === 'number' && theirs.at > dropped)) delete stored[key];
      if (Object.keys(stored).length) localStorage.setItem(this.journalKey(), JSON.stringify(stored));
      else localStorage.removeItem(this.journalKey());
    } catch {
      // Storage full or unavailable: the in-memory queue still works while the tab is open.
    }
  }

  private loadJournal() {
    for (const [key, value] of Object.entries(this.readStoredJournal())) {
      // Entries from before stamps existed were the bare document; treat them as oldest.
      const entry = value as Partial<JournalEntry>;
      this.journal[key] = entry && 'data' in entry && 'at' in entry ? (entry as JournalEntry) : { data: value as object, at: 0 };
    }
  }

  private dropJournal(key: string, at: number) {
    if (this.journal[key]?.at !== at) return; // superseded by a newer edit
    delete this.journal[key];
    this.persistJournal(key, at);
  }

  /** Re-sends writes left over from a closed tab, unless the server already has something newer. */
  private replayJournal() {
    for (const [key, entry] of Object.entries(this.journal)) {
      if (this.pending.has(key)) continue;
      const server = this.savedAt.get(key);
      const deletedElsewhere = server === undefined && entry.existed === true;
      if (deletedElsewhere || (server ?? 0) > entry.at) this.dropJournal(key, entry.at);
      else void this.send(key, entry.data, entry.at);
    }
  }

  /** Hands a write to Firestore; the journal entry goes once Firestore's own queue has it or the server confirms. */
  private send(key: string, data: object, at: number) {
    setTimeout(() => this.dropJournal(key, at), HANDOFF_SAFE_MS);
    return setDoc(this.ref(key), { ...data, _savedAt: at })
      .then(() => this.dropJournal(key, at))
      .catch((err) => console.error(`Failed to save ${key}`, err));
  }

  private schedule(key: string, data: object) {
    const at = Date.now();
    this.journal[key] = { data, at, existed: this.onServer.has(key) };
    this.persistJournal(key);
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.send(key, data, at);
    }, WRITE_DELAY_MS);
    this.pending.set(key, { timer, data });
  }

  /** Hands every queued write to Firestore now (it confirms them in the background). */
  async flush() {
    const writes = [...this.pending.entries()];
    this.pending.clear();
    for (const [, { timer }] of writes) clearTimeout(timer);
    // Don't await server confirmation here: offline it would never resolve.
    writes.forEach(([key, { data }]) => void this.send(key, data, this.journal[key]?.at ?? Date.now()));
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
    this.persistJournal(key);
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
    const at = Date.now();
    const ops: { name: CollectionName; record: { id: ID } }[] = [];
    for (const name of COLLECTIONS) for (const record of (snapshot[name] ?? []) as { id: ID }[]) ops.push({ name, record });
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.db);
      for (const { name, record } of ops.slice(i, i + BATCH_SIZE)) batch.set(doc(this.col(name), record.id), { ...record, _savedAt: at });
      await batch.commit();
    }
  }

  /**
   * Replaces everything with a backup. Checked before anything changes, then the backup is written first and only
   * records it doesn't contain are deleted afterwards, so a failure part-way never leaves the account empty.
   */
  async importSnapshot(snapshot: Snapshot) {
    checkSnapshot(snapshot);
    // Batched writes only finish online; offline they'd wait forever with the account half-replaced.
    if (!navigator.onLine) throw new Error("You're offline. Restore the backup when you're back online.");
    await this.flush();
    const existing = await Promise.all(COLLECTIONS.map((name) => getDocs(this.col(name))));
    await this.mergeSnapshot(snapshot);
    const keep = new Set(COLLECTIONS.flatMap((name) => ((snapshot[name] ?? []) as { id: ID }[]).map((r) => `${name}/${r.id}`)));
    const stale = existing.flatMap((snap, i) => snap.docs.filter((d) => !keep.has(`${COLLECTIONS[i]}/${d.id}`)).map((d) => d.ref));
    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.db);
      stale.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await setDoc(this.settingsDoc(), { ...DEFAULT_SETTINGS, ...snapshot.settings, _savedAt: Date.now() });
  }

  /** Why live sync stopped, if it did (shown by the sync indicator). */
  getSyncError() {
    return this.syncError;
  }
}
