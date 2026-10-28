import { Fragment, useState, type CSSProperties } from 'react';
import { addDays, dailyActivity, dayKey, startOfDay, startOfWeek, type DayActivity } from '../core/activity';
import { pluralize } from '../core/format';
import type { Session } from '../core/types';
import { useOpenDay } from './DaySessions';

type Range = '1W' | '1M' | '6M';
const RANGES: Range[] = ['1W', '1M', '6M'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const STORAGE_KEY = 'fitness-tracker:heatmap-range';

/**
 * What a range shows, in Monday-first weeks. 1W: this week. 1M: this calendar month, padded to whole weeks with the
 * neighbouring months' dates (…30, 31, 1, 2…). 6M: the last 26 weeks. `from` is where the stats start counting.
 */
function rangeLayout(range: Range, today: Date): { weeks: Date[][]; from: Date; caption: string | null } {
  const weeksFrom = (monday: Date, count: number) =>
    Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)));
  if (range === '1W') {
    const monday = startOfWeek(today);
    const sunday = addDays(monday, 6);
    const sameMonth = monday.getMonth() === sunday.getMonth();
    const caption = `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(
      undefined,
      sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' },
    )}`;
    return { weeks: weeksFrom(monday, 1), from: monday, caption };
  }
  if (range === '1M') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const monday = startOfWeek(first);
    const count = Math.round((startOfWeek(last).getTime() - monday.getTime()) / (7 * 86_400_000)) + 1;
    return { weeks: weeksFrom(monday, count), from: first, caption: today.toLocaleDateString(undefined, { month: 'long' }) };
  }
  const monday = addDays(startOfWeek(today), -7 * 25);
  return { weeks: weeksFrom(monday, 26), from: monday, caption: null };
}

function savedRange(): Range {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return RANGES.includes(value as Range) ? (value as Range) : '6M';
  } catch {
    return '6M';
  }
}

/**
 * Training activity: blue = trained, gray = rest. Deliberately two states — you train at most once a day, and set
 * counts mostly reflect which workout it was rather than effort. 6M is a compact grid (columns are weeks); 1M and 1W
 * are calendars (columns are weekdays) with the date in each square and the month or week as a caption.
 */
export function TrainingHeatmap({ sessions }: { sessions: Session[] }) {
  const [range, setRange] = useState<Range>(savedRange);
  const [openDay, daySummary] = useOpenDay(sessions);
  const activity = dailyActivity(sessions);
  const today = startOfDay(new Date());
  const { weeks, from, caption } = rangeLayout(range, today);
  const calendar = range !== '6M';

  const choose = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(STORAGE_KEY, r);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };

  let sessionCount = 0;
  let activeDays = 0;
  for (const [key, day] of activity) {
    if (key >= dayKey(from) && key <= dayKey(today)) {
      sessionCount += day.sessions.length;
      activeDays += 1;
    }
  }
  const elapsedWeeks = Math.max(1, (today.getTime() - from.getTime()) / (7 * 86_400_000));

  /**
   * A day's square. `at` is its place in the grid (column, row, columns, rows): trained squares show their part of one
   * rainbow spread across the whole grid.
   */
  // The legend's "Trained" square shows the same part of the rainbow as the latest trained day, so they match.
  const shown = [...activity.keys()].filter((k) => k >= dayKey(from) && k <= dayKey(today));
  const latestKey = shown.length ? shown.reduce((a, b) => (a > b ? a : b)) : '';
  const places = new Map<string, CSSProperties>();
  const cell = (date: Date, at: [number, number, number, number]) => {
    const key = dayKey(date);
    // Days from the neighbouring months that pad the 1M calendar to whole weeks.
    const outside = range === '1M' && date.getMonth() !== today.getMonth() ? ' outside' : '';
    if (date > today) {
      return calendar ? (
        <span key={key} className={`heat-cell big future${outside}`}>
          {date.getDate()}
        </span>
      ) : (
        <span key={key} />
      );
    }
    const day: DayActivity | undefined = activity.get(key);
    const label = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${
      day ? `${day.sessions.map((s) => s.name).join(', ')} · ${pluralize(day.sets, 'set')}` : 'Rest'
    }`;
    const className = `heat-cell${day ? ' trained' : ''}${calendar ? ' big' : ''}${key === dayKey(today) ? ' today' : ''}${outside}`;
    const content = calendar ? date.getDate() : null;
    const [x, y, w, h] = at;
    const place = { '--gx': w > 1 ? x / (w - 1) : 0, '--gy': h > 1 ? y / (h - 1) : 0, '--gw': w, '--gh': h } as CSSProperties;
    if (key === latestKey) places.set(key, place);
    return day ? (
      <button key={key} className={className} style={place} title={label} aria-label={label} onClick={() => openDay(date, day)}>
        {content}
      </button>
    ) : (
      <span key={key} className={className} title={label}>
        {content}
      </span>
    );
  };

  return (
    <div>
      {daySummary}
      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Activity
        </h2>
        <div className="segmented" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={r === range} className={r === range ? 'on' : ''} onClick={() => choose(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* key replays the entrance animation when the range changes */}
      {calendar ? (
        <div key={range} className={`heatmap heatmap-calendar${range === '1M' ? ' month' : ''}`}>
          <div className="heatmap-caption">{caption}</div>
          {DAY_LETTERS.map((l, i) => (
            <span key={`h${i}`} className="heatmap-day">
              {l}
            </span>
          ))}
          {weeks.flat().map((date, i) => cell(date, [i % 7, Math.floor(i / 7), 7, weeks.length]))}
        </div>
      ) : (
        <div key={range} className="heatmap" style={{ gridTemplateColumns: `16px repeat(${weeks.length}, minmax(0, 1fr))` }}>
          <span />
          {monthLabels(weeks).map((label, w) => (
            <span key={`m${w}`} className="heatmap-month">
              {label}
            </span>
          ))}
          {DAY_LETTERS.map((letter, d) => (
            <Fragment key={d}>
              <span className="heatmap-day">{d % 2 === 0 ? letter : ''}</span>
              {weeks.map((days, w) => cell(days[d], [w, d, weeks.length, 7]))}
            </Fragment>
          ))}
        </div>
      )}

      <div className="spread small muted" style={{ marginTop: 10 }}>
        <span className="tnum">
          {pluralize(sessionCount, 'session')} on {pluralize(activeDays, 'day')}
          {range !== '1W' && ` · ${(sessionCount / elapsedWeeks).toFixed(1)}/week`}
        </span>
        <span className="row" style={{ gap: 10 }} aria-hidden="true">
          <span className="row" style={{ gap: 4 }}>
            <span className="heat-cell" style={{ width: 10, height: 10 }} /> Rest
          </span>
          <span className="row" style={{ gap: 4 }}>
            <span className="heat-cell trained" style={{ ...places.get(latestKey), width: 10, height: 10 }} /> Trained
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Month name over the first week of each month. A partial first month is dropped when the next month starts within
 * 3 columns, and labels never sit closer than 3 columns apart.
 */
function monthLabels(weeks: Date[][]): string[] {
  const starts = weeks.map((_, w) => w).filter((w) => w === 0 || weeks[w][0].getMonth() !== weeks[w - 1][0].getMonth());
  if (starts[1] !== undefined && starts[1] < 3) starts.shift();
  const shown = new Set<number>();
  for (const w of starts) {
    if (w - Math.max(-Infinity, ...shown) >= 3) shown.add(w);
  }
  return weeks.map((days, w) => (shown.has(w) ? days[0].toLocaleDateString(undefined, { month: 'short' }) : ''));
}
