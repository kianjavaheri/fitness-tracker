import { registerPlugin } from '@capacitor/core';
import { isImportedSession, sessionDurationMinutes } from '../core/sessions';
import type { Session } from '../core/types';
import { isNative } from './platform';

/** ios/App/App/AppHealthPlugin.swift */
const AppHealth = registerPlugin<{
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ granted: boolean; canSave: boolean }>;
  saveWorkout(options: { id: string; name: string; start: string; end: string }): Promise<void>;
  deleteWorkout(options: { id: string }): Promise<void>;
}>('AppHealth');

/** On for this phone ("Save to Apple Health" in Settings). Health permission is per device, so this isn't synced. */
const KEY = 'lifttrack:apple-health';

const report = (err: unknown) => console.warn('[AppHealth]', err);

/** Apple Health exists only in the iPhone app. */
export const healthSupported = isNative;

export function appleHealthOn(): boolean {
  if (!healthSupported) return false;
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Turns saving to Apple Health on (showing Apple's permission sheet the first time) or off. Resolves to whether it's
 * on: false if Health isn't available or writing workouts wasn't allowed.
 */
export async function setAppleHealth(on: boolean): Promise<boolean> {
  let allowed = false;
  if (on && healthSupported) {
    try {
      const { available } = await AppHealth.isAvailable();
      allowed = available && (await AppHealth.requestAuthorization()).canSave;
    } catch (err) {
      report(err);
    }
  }
  try {
    if (allowed) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* stays off */
  }
  return allowed;
}

/**
 * One call at a time: each save first removes the session's earlier copy, so two saves at once (Finish tapped twice)
 * would both find nothing to remove and both add one.
 */
let queue: Promise<unknown> = Promise.resolve();
const enqueue = (call: () => Promise<unknown>) => {
  queue = queue.then(call).catch(report);
};

/** What Health is told about a session, to skip saving it again when nothing it shows has changed. */
const lastSaved = new Map<string, string>();

/**
 * Saves a finished workout to Apple Health as strength training over the time it took (replacing an earlier copy if
 * it was finished before). Skipped when it's off; a workout with no duration (logged after the fact, or cleared) has
 * no time span, so any earlier copy is removed instead.
 */
export function saveToAppleHealth(session: Session) {
  if (!appleHealthOn() || !session.finishedAt) return;
  const minutes = sessionDurationMinutes(session);
  if (!minutes) {
    if (lastSaved.get(session.id) !== '') removeFromAppleHealth(session.id);
    lastSaved.set(session.id, '');
    return;
  }
  const end = new Date(Date.parse(session.startedAt) + minutes * 60_000).toISOString();
  const workout = { id: session.id, name: session.name, start: session.startedAt, end };
  lastSaved.set(session.id, JSON.stringify(workout));
  enqueue(() => AppHealth.saveWorkout(workout));
}

/** Finished workouts Health can take: ones with a duration, not the past sessions made by importing notes. */
export function healthWorkouts(sessions: Session[]): Session[] {
  return sessions.filter((s) => s.finishedAt && !isImportedSession(s) && sessionDurationMinutes(s));
}

/**
 * Saves workouts finished before saving was turned on. Each replaces its own earlier copy, so doing it twice doesn't
 * add them twice. Resolves once they've all been handed to Health.
 */
export function saveAllToAppleHealth(sessions: Session[]): Promise<unknown> {
  for (const s of healthWorkouts(sessions)) saveToAppleHealth(s);
  return queue;
}

const pendingSync = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Keeps Health up to date while a finished workout is edited (its name, date, time or duration): saved once the
 * typing stops, and only if what Health shows changed.
 */
export function syncToAppleHealth(session: Session) {
  if (!appleHealthOn() || !session.finishedAt) return;
  clearTimeout(pendingSync.get(session.id));
  pendingSync.set(
    session.id,
    setTimeout(() => {
      pendingSync.delete(session.id);
      const minutes = sessionDurationMinutes(session);
      const end = minutes ? new Date(Date.parse(session.startedAt) + minutes * 60_000).toISOString() : null;
      const shown = end ? JSON.stringify({ id: session.id, name: session.name, start: session.startedAt, end }) : '';
      if (lastSaved.has(session.id) && lastSaved.get(session.id) === shown) return;
      saveToAppleHealth(session);
    }, 1500),
  );
}

/**
 * Removes a deleted workout's copy from Apple Health. Runs even with saving turned off, so workouts saved while it
 * was on don't stay behind (nothing happens if there's no copy).
 */
export function removeFromAppleHealth(sessionId: string) {
  if (!healthSupported) return;
  clearTimeout(pendingSync.get(sessionId));
  pendingSync.delete(sessionId);
  lastSaved.delete(sessionId);
  enqueue(() => AppHealth.deleteWorkout({ id: sessionId }));
}
