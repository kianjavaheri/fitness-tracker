import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';
import type { Session } from '../core/types';
import { isNative } from './platform';

/** ios/App/App/RestActivityPlugin.swift */
interface RestActivityPlugin {
  start(options: { endsAt: number; workoutName: string }): Promise<{ shown: boolean }>;
  stop(): Promise<void>;
}
const RestActivity = registerPlugin<RestActivityPlugin>('RestActivity');

const NOTIFICATION_ID = 1;
/** After a rest ends with the app open, how long "Rest over" stays on the lock screen before it's cleared. */
const OVER_SHOWN_MS = 15_000;

// Calls run one after another, so quick ±15 taps can't land out of order.
let queue = Promise.resolve();
const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((err) => console.warn('Rest timer (native):', err));
};

function show(endsAt: number, workoutName: string) {
  enqueue(async () => {
    await RestActivity.start({ endsAt, workoutName });
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display.startsWith('prompt')) permission = await LocalNotifications.requestPermissions();
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    if (permission.display !== 'granted') return;
    // The buzz when rest is over: the phone delivers it on time even when locked or with the app closed.
    await LocalNotifications.schedule({
      notifications: [{ id: NOTIFICATION_ID, title: 'Rest over', body: `Next set: ${workoutName}`, schedule: { at: new Date(endsAt) } }],
    });
  });
}

function clear() {
  enqueue(async () => {
    await RestActivity.stop();
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  });
}

/**
 * In the iPhone app, mirrors the open workout's rest timer onto the lock screen / Dynamic Island (a Live Activity)
 * and schedules the "Rest over" notification. Mounted once in Layout, so it follows the rest from any page.
 */
export function useNativeRestTimer(open: Session | undefined) {
  const endsAt = open && open.live !== false && !open.restHidden ? (open.restEndsAt ?? null) : null;
  const name = open?.name ?? '';

  useEffect(() => {
    if (!isNative) return;
    const at = endsAt ? Date.parse(endsAt) : 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      const left = at - Date.now();
      if (left > 0) {
        show(at, name);
        timer = setTimeout(sync, left + OVER_SHOWN_MS);
      } else {
        clear();
      }
    };
    sync();
    // Back from the lock screen after the rest ended: clear the stale "Rest over".
    const onVisible = () => document.visibilityState === 'visible' && Date.now() >= at && clear();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAt, name]);
}
