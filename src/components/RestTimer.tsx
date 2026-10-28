import { Minus, Play, Plus, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  onAdjust: (seconds: number) => void;
  onHide: () => void;
  onShow: () => void;
}

/**
 * Rest bar for a live workout, pinned at the top under Back. Idle it offers Start (checking off a set also starts it);
 * running it counts down with −15 s / +15 s; when it ends it turns coral for a few seconds. The × closes it to a small
 * pill that stays where the bar was, and tapping that brings the pinned bar back.
 */
export function RestTimer({ endsAt, hidden, startLabel, onStart, onAdjust, onHide, onShow }: RestTimerProps) {
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
    <div className={`rest-timer ${state}`} role="timer" aria-live={state === 'over' ? 'assertive' : 'off'}>
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
        <button className="rest-btn" onClick={onHide} aria-label="Close the rest timer">
          <X size={14} />
        </button>
      </span>
    </div>
  );
}
