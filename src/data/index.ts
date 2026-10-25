import type { Repository } from '../core/repository';
import type { ID } from '../core/types';
import { LocalRepository } from './localRepository';

/**
 * Forwards every call to the active implementation and lets the app swap it at runtime:
 * local (IndexedDB) when signed out, cloud (Firestore) when signed in. Subscribers stay
 * attached across swaps and are notified so every view reloads from the new source.
 */
class SwitchableRepository implements Repository {
  private listeners = new Set<() => void>();
  private detach: () => void;
  private current: Repository;

  constructor(initial: Repository) {
    this.current = initial;
    this.detach = initial.subscribe(() => this.emit());
  }

  use(next: Repository) {
    if (next === this.current) return;
    this.detach();
    this.current.dispose?.();
    this.current = next;
    this.detach = next.subscribe(() => this.emit());
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listExercises = () => this.current.listExercises();
  saveExercise = (...a: Parameters<Repository['saveExercise']>) => this.current.saveExercise(...a);
  listWorkouts = () => this.current.listWorkouts();
  getWorkout = (id: ID) => this.current.getWorkout(id);
  saveWorkout = (...a: Parameters<Repository['saveWorkout']>) => this.current.saveWorkout(...a);
  deleteWorkout = (id: ID) => this.current.deleteWorkout(id);
  listRoutines = () => this.current.listRoutines();
  getRoutine = (id: ID) => this.current.getRoutine(id);
  saveRoutine = (...a: Parameters<Repository['saveRoutine']>) => this.current.saveRoutine(...a);
  deleteRoutine = (id: ID) => this.current.deleteRoutine(id);
  listSessions = () => this.current.listSessions();
  getSession = (id: ID) => this.current.getSession(id);
  saveSession = (...a: Parameters<Repository['saveSession']>) => this.current.saveSession(...a);
  deleteSession = (id: ID) => this.current.deleteSession(id);
  getSettings = () => this.current.getSettings();
  saveSettings = (...a: Parameters<Repository['saveSettings']>) => this.current.saveSettings(...a);
  exportSnapshot = () => this.current.exportSnapshot();
  importSnapshot = (...a: Parameters<Repository['importSnapshot']>) => this.current.importSnapshot(...a);
  mergeSnapshot = (...a: Parameters<Repository['mergeSnapshot']>) => this.current.mergeSnapshot(...a);
  flush = async () => {
    await this.current.flush?.();
  };
  getSyncError = () => this.current.getSyncError?.() ?? null;
}

/** This device's own data; always available, and what the app uses when signed out. */
export const localRepo = new LocalRepository();

const switchable = new SwitchableRepository(localRepo);

/** The repository the whole app reads and writes through. */
export const repo: Repository = switchable;

/** Points the app at a different data source (called by the auth layer). */
export function setActiveRepository(next: Repository) {
  switchable.use(next);
}
