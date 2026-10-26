import { useState } from 'react';
import { addDays, startOfDay } from '../core/activity';
import { toLocalInput } from '../core/format';

/**
 * Separate date and time fields for an ISO timestamp, plus Today / Yesterday shortcuts when it started out as today or
 * yesterday (a new log). An older workout gets no shortcuts: one tap would move it to a recent day.
 */
export function DateTimeFields({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [date, time] = toLocalInput(value).split('T');
  const today = toLocalInput(new Date().toISOString()).split('T')[0];
  // By calendar day, not 24 hours back, so it's right around daylight-saving changes.
  const yesterday = toLocalInput(addDays(startOfDay(new Date()), -1).toISOString()).split('T')[0];
  // Decided by the date it opened with, so picking an older date for a new log doesn't hide them.
  const [shortcuts] = useState(() => date >= yesterday);

  const set = (nextDate: string, nextTime: string) => {
    if (!nextDate || !nextTime) return;
    onChange(new Date(`${nextDate}T${nextTime}`).toISOString());
  };

  return (
    <div className="datetime">
      {shortcuts && (
        <div className="segmented">
          <button type="button" className={date === today ? 'on' : ''} onClick={() => set(today, time)}>
            Today
          </button>
          <button type="button" className={date === yesterday ? 'on' : ''} onClick={() => set(yesterday, time)}>
            Yesterday
          </button>
        </div>
      )}
      <label>
        <span className="label">Date</span>
        <input className="input" type="date" value={date} max={today} onChange={(e) => set(e.target.value, time)} />
      </label>
      <label>
        <span className="label">Time</span>
        <input className="input" type="time" value={time} onChange={(e) => set(date, e.target.value)} />
      </label>
    </div>
  );
}
