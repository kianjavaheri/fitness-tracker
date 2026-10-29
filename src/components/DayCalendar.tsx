import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { addDays, dayKey, startOfWeek } from '../core/activity';
import { Modal } from './Modal';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "2026-10-22" → that local day. */
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * A month calendar in a dialog with the given days highlighted; only those can be picked. Opens on the selected day's
 * month and pages back and forth between the first highlighted month and this one.
 */
export function DayCalendar({
  title,
  days,
  selected,
  latest,
  onPick,
  onClose,
}: {
  title: string;
  /** Local days ("YYYY-MM-DD") that can be picked. */
  days: Set<string>;
  selected: string | null;
  /** The most recent day, offered as a way back when another is picked. */
  latest?: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const start = selected ? fromKey(selected) : new Date();
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const sorted = [...days].sort();
  const first = sorted[0] ? fromKey(sorted[0]) : new Date();
  const today = new Date();
  const canBack = month > new Date(first.getFullYear(), first.getMonth(), 1);
  const canForward = month < new Date(today.getFullYear(), today.getMonth(), 1);
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  // Whole Monday–Sunday weeks covering the month.
  const gridStart = startOfWeek(month);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells: Date[] = [];
  for (let d = gridStart; d <= end || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  const inMonth = sorted.filter((k) => k.startsWith(dayKey(month).slice(0, 7))).length;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="day-cal">
        <div className="spread">
          <button className="icon-btn" disabled={!canBack} onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 650 }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div className="muted small">{inMonth === 0 ? 'Not done this month' : `Done ${inMonth} ${inMonth === 1 ? 'time' : 'times'}`}</div>
          </div>
          <button className="icon-btn" disabled={!canForward} onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="day-cal-grid">
          {WEEKDAYS.map((d) => (
            <span key={d} className="day-cal-head">
              {d[0]}
            </span>
          ))}
          {cells.map((d) => {
            const key = dayKey(d);
            const done = days.has(key);
            const cls = [
              'day-cal-day',
              d.getMonth() !== month.getMonth() && 'out',
              done && 'done',
              key === selected && 'selected',
              key === dayKey(today) && 'today',
            ]
              .filter(Boolean)
              .join(' ');
            return done ? (
              <button key={key} className={cls} onClick={() => onPick(key)} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={key === selected}>
                {d.getDate()}
              </button>
            ) : (
              <span key={key} className={cls}>
                {d.getDate()}
              </span>
            );
          })}
        </div>
        <p className="muted small" style={{ margin: '12px 0 0', textAlign: 'center' }}>
          Highlighted days are when you did it. Pick one to see those numbers.
        </p>
        {latest && selected !== latest && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="btn btn-sm" onClick={() => onPick(latest)}>
              <RotateCcw size={14} /> Back to latest · {fromKey(latest).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
