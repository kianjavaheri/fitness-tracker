import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import { currentSet } from '../core/sessions';
import type { Exercise, Session } from '../core/types';
import { hapticAlert } from '../utils/haptics';
import { isNative } from './platform';

/** What the lock screen shows (ios/App/App/RestActivityPlugin.swift, drawn by the RestTimerWidget extension). */
interface WorkoutActivity {
  workoutName: string;
  /** The workout's start (ms), for the time so far. */
  startedAt: number;
  /** The exercise you're on, and which set ("Set 2 of 3"); "All sets done" once there's none left. */
  exercise: string;
  detail: string;
  /** End of the rest under way (ms), or 0 when not resting. */
  restEndsAt: number;
  /** Matches the app's theme: light or dark colours. */
  dark: boolean;
  /** The exercise's picture (its address; the app keeps a small copy the lock screen can show), or '' for none. */
  image: string;
}

/** ios/App/App/RestActivityPlugin.swift */
interface RestActivityPlugin {
  start(options: WorkoutActivity): Promise<{ shown: boolean }>;
  stop(): Promise<void>;
  /** Saves small copies of these pictures for the lock screen ahead of time, so changing exercise never waits. */
  prefetchImages(options: { urls: string[] }): Promise<void>;
}
const RestActivity = registerPlugin<RestActivityPlugin>('RestActivity');

const NOTIFICATION_ID = 1;
/** After a rest ends with the app open, how long "Rest over" stays on the lock screen before the bar goes. */
const OVER_SHOWN_MS = 15_000;

// Calls run one after another, so quick ±15 taps can't land out of order.
let queue = Promise.resolve();
const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((err) => console.warn('Lock screen (native):', err));
};

function show(activity: WorkoutActivity) {
  enqueue(async () => {
    // Its own try: the notification below must still be scheduled if the lock-screen view can't be shown.
    await RestActivity.start(activity).catch((err) => console.warn('Lock screen workout:', err));
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    if (activity.restEndsAt <= Date.now()) return;
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display.startsWith('prompt')) permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return;
    // The buzz when rest is over: the phone delivers it on time even when locked or with the app closed.
    await LocalNotifications.schedule({
      notifications: [{ id: NOTIFICATION_ID, title: 'Rest over', body: `Next: ${activity.exercise}`, schedule: { at: new Date(activity.restEndsAt) } }],
    });
  });
}

function clear() {
  enqueue(async () => {
    await RestActivity.stop();
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  });
}

/** Takes the workout off the lock screen and cancels its notification (signing out: it shows that account's workout). */
export async function stopNativeRest() {
  if (!isNative) return;
  clear();
  await queue;
}

/**
 * In the iPhone app, shows the live workout on the lock screen and in the Dynamic Island (a Live Activity) like Hevy:
 * the exercise and set you're on, the time so far, and while resting the countdown and its bar; it also schedules the
 * "Rest over" notification. Mounted once in Layout, so it follows the workout from any page.
 * `open` is null with no open workout, undefined while that isn't known yet: then nothing is changed, so reopening the
 * app keeps what's on the lock screen. `restOn` false (the Settings switch) leaves out rests.
 */
export function useNativeRestTimer(
  open: Session | null | undefined,
  exercises: Exercise[] | undefined,
  restOn: boolean,
  dark: boolean,
  pictureOf: (exerciseId: string) => string | undefined,
) {
  const loading = open === undefined || exercises === undefined;
  const live = !!open && open.live !== false && !open.finishedAt;
  const endsAt = live && restOn && !open.restHidden ? (open.restEndsAt ?? null) : null;
  const now = live ? currentSet(open) : null;
  const exercise = now ? (exercises?.find((e) => e.id === now.entry.exerciseId)?.name ?? 'Exercise') : 'All sets done';
  const detail = now?.label ?? (open ? `${open.entries.length} exercises` : '');
  const name = open?.name ?? '';
  const startedAt = open ? Date.parse(open.startedAt) : 0;
  const image = (now && pictureOf(now.entry.exerciseId)) ?? '';
  // Every picture in the workout, fetched once when it opens or changes (and once the pictures are known).
  const pictures = live ? [...new Set(open.entries.map((e) => pictureOf(e.exerciseId)).filter((u): u is string => !!u))].join('\n') : '';

  useEffect(() => {
    if (!isNative || !pictures) return;
    void RestActivity.prefetchImages({ urls: pictures.split('\n') }).catch((err) => console.warn('Lock screen pictures:', err));
  }, [pictures]);

  useEffect(() => {
    if (!isNative || loading) return;
    if (!live) {
      clear();
      return;
    }
    const at = endsAt ? Date.parse(endsAt) : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let buzz: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      clearTimeout(buzz);
      const left = at - Date.now();
      const resting = left > -OVER_SHOWN_MS && at > 0;
      show({ workoutName: name, startedAt, exercise, detail, restEndsAt: resting ? at : 0, dark, image });
      if (left > 0) {
        // With the app open, the end of the rest is felt too (the notification covers a locked phone).
        buzz = setTimeout(() => document.visibilityState === 'visible' && hapticAlert(), left);
      }
      // Once "Rest over" has shown for a moment, the bar goes and only the exercise stays.
      if (resting) timer = setTimeout(sync, left + OVER_SHOWN_MS);
    };
    sync();
    return () => {
      clearTimeout(timer);
      clearTimeout(buzz);
    };
  }, [loading, live, endsAt, name, startedAt, exercise, detail, dark, image]);
}
