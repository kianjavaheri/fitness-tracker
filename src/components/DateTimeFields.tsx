import { toLocalInput } from '../core/format';

/** Separate date and time fields for an ISO timestamp (a new log starts at today and now). */
export function DateTimeFields({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [date, time] = toLocalInput(value).split('T');
  const today = toLocalInput(new Date().toISOString()).split('T')[0];

  // A workout can't have happened later than now: a time later today is brought back to now.
  const set = (nextDate: string, nextTime: string) => {
    if (!nextDate || !nextTime) return;
    const at = new Date(`${nextDate}T${nextTime}`).getTime();
    onChange(new Date(Math.min(at, Date.now())).toISOString());
  };

  return (
    <div className="datetime">
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
