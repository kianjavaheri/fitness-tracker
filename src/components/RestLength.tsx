import { useState } from 'react';
import { NumericInput } from './NumericInput';

/** Longest rest the timer takes: 60:00. */
export const MAX_REST_SECONDS = 60 * 60;

/** Rest length as minutes and seconds, any length up to 60:00; 0:00 turns the automatic start off. */
export function RestLength({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  // Kept here while editing: the saved setting comes back a moment later, and typing seconds right after minutes
  // must not combine them with the old minutes. Follows the saved value when it changes (e.g. on another device).
  const [total, setTotal] = useState(seconds);
  const [saved, setSaved] = useState(seconds);
  if (seconds !== saved) {
    setSaved(seconds);
    setTotal(seconds);
  }
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const set = (m: number, s: number) => {
    const next = Math.min(MAX_REST_SECONDS, m * 60 + s);
    setTotal(next);
    onChange(next);
  };
  const digits = (text: string, max: number) => (text ? Math.min(max, parseInt(text, 10)) : 0);
  return (
    <div className="rest-length">
      <label>
        <NumericInput
          className="rest-field"
          ariaLabel="Rest minutes"
          value={min}
          format={(v) => String(v ?? 0)}
          parse={(t) => digits(t, 60)}
          onChange={(m) => set(m ?? 0, (m ?? 0) >= 60 ? 0 : sec)}
        />
        <span className="muted small">min</span>
      </label>
      <label>
        <NumericInput
          className="rest-field"
          ariaLabel="Rest seconds"
          value={sec}
          format={(v) => String(v ?? 0).padStart(2, '0')}
          parse={(t) => digits(t, 59)}
          onChange={(s) => set(min, min >= 60 ? 0 : (s ?? 0))}
        />
        <span className="muted small">sec</span>
      </label>
    </div>
  );
}
