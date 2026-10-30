import { Minus, Play, Plus, Square, Timer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** How long "Rest over" stays up before the bar goes back to idle. */
const DONE_SHOWN_MS = 15_000;

export const formatRest = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

interface RestTimerProps {
  endsAt: string | null;
  /** Closed with ×: shown as a small "Rest timer" pill in the page (not pinned) until tapped. */
  hidden: boolean;
  /** Length a manual start uses, e.g. "2:00". */
  startLabel: string;
  onStart: () => void;
  /** Ends the rest under way; the bar stays, idle. */
  onStop: () => void;
  onAdjust: (seconds: number) => void;
  onHide: () => void;
  onShow: () => void;
}

/**
 * Rest bar for a live workout, under Back and pinned to the top of the screen once scrolled to it (then edge to edge,
 * attached to the top, so nothing scrolls above it to mis-tap). Idle it offers Start (checking off a set also starts
 * it); running it counts down with −15 s / +15 s and Stop; when it ends it turns rainbow for a few seconds. The ×
 * closes it to a small pill that stays where the bar was, and tapping that brings the pinned bar back.
 */
export function RestTimer({ endsAt, hidden, startLabel, onStart, onStop, onAdjust, onHide, onShow }: RestTimerProps) {
  // Stuck to the top of the screen (scrolled past its place under Back): drawn attached to the top edge.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const check = () => {
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      setStuck(bar.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [hidden]);
  // Ticks only while a rest is running or just over; the time itself is read when drawing, so a rest that was just
  // started shows its full length at once rather than counting from when the last tick happened.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt || hidden) return;
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() > Date.parse(endsAt) + DONE_SHOWN_MS) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [endsAt, hidden]);
  const now = Date.now();

  if (hidden) {
    return (
      <button className="rest-pill" onClick={onShow}>
        <Timer size={15} /> Rest timer
      </button>
    );
  }

  const left = endsAt ? Math.ceil((Date.parse(endsAt) - now) / 1000) : null;
  const state = left == null || left < -DONE_SHOWN_MS / 1000 ? 'idle' : left <= 0 ? 'over' : 'running';

  return (
    <div ref={barRef} className={`rest-timer ${state}${stuck ? ' stuck' : ''}`} role="timer" aria-live={state === 'over' ? 'assertive' : 'off'}>
      <span className="rest-label tnum">
        <Timer size={16} />
        {state === 'idle' ? 'Rest' : state === 'over' ? 'Rest over' : `Rest ${formatRest(left ?? 0)}`}
      </span>
      <span className="row" style={{ gap: 6 }}>
        {state === 'idle' && (
          <button className="rest-btn" onClick={onStart} aria-label={`Start a ${startLabel} rest`}>
            <Play size={13} /> Start {startLabel}
          </button>
        )}
        {state === 'running' && (
          <>
            <button className="rest-btn" onClick={() => onAdjust(-15)} aria-label="15 seconds less">
              <Minus size={14} />
              15
            </button>
            <button className="rest-btn" onClick={() => onAdjust(15)} aria-label="15 seconds more">
              <Plus size={14} />
              15
            </button>
          </>
        )}
        {state === 'over' && (
          <button className="rest-btn" onClick={onStart} aria-label={`Start another ${startLabel} rest`}>
            <Play size={13} /> Again
          </button>
        )}
        {state !== 'idle' && (
          <button className="rest-btn stop" onClick={onStop} aria-label="Stop the rest" title="Stop">
            <Square size={12} fill="currentColor" />
          </button>
        )}
        <button className="rest-btn" onClick={onHide} aria-label="Close the rest timer">
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
