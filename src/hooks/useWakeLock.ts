import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` (a live workout is open), so the phone doesn't lock between sets. iOS releases
 * the lock whenever the app goes to the background, so it's taken again on return. A no-op where unsupported.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) void lock.release();
      } catch {
        // Not allowed right now (e.g. low battery mode); the screen just locks as usual.
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);
}
