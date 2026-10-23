import { toLocalInput } from '../core/format';

/** Separate date and time fields (plus Today / Yesterday shortcuts) for an ISO timestamp. */
export function DateTimeFields({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [date, time] = toLocalInput(value).split('T');
  const today = toLocalInput(new Date().toISOString()).split('T')[0];
  const yesterday = toLocalInput(new Date(Date.now() - 86_400_000).toISOString()).split('T')[0];

  const set = (nextDate: string, nextTime: string) => {
    if (!nextDate || !nextTime) return;
    onChange(new Date(`${nextDate}T${nextTime}`).toISOString());
  };

  return (
    <div className="datetime">
      <div className="segmented">
        <button type="button" className={date === today ? 'on' : ''} onClick={() => set(today, time)}>
          Today
        </button>
        <button type="button" className={date === yesterday ? 'on' : ''} onClick={() => set(yesterday, time)}>
          Yesterday
        </button>
      </div>
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
