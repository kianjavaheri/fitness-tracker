import { useState, type CSSProperties } from 'react';

/** When the loader in index.html fades in (its `.boot` animation: 0.4 s delay, 0.3 s fade), from page load. */
const BOOT_DELAY_MS = 400;
const BOOT_FADE_MS = 300;

/**
 * Shown while the saved sign-in is restored (or while signing out): the same loader as index.html's, which shows
 * while the app's code loads, so a slow start is one steady spinner. It keeps that loader's timing, so returning users
 * (restored in a few milliseconds) see nothing, and one already on screen carries on without fading out and back in.
 */
export function Splash({ message, immediate = false }: { message?: string; immediate?: boolean }) {
  const [style] = useState<CSSProperties>(() => {
    const since = performance.now();
    if (immediate || since >= BOOT_DELAY_MS + BOOT_FADE_MS) return { animation: 'none', opacity: 1 };
    return { animationDelay: `${Math.max(0, BOOT_DELAY_MS - since)}ms` };
  });

  return (
    <div className="boot" role="status" aria-live="polite" aria-label={message ?? 'Loading'} style={style}>
      <div className="boot-spin">
        <img src="/favicon.svg" alt="" />
      </div>
      {message && <div className="muted small">{message}</div>}
    </div>
  );
}
