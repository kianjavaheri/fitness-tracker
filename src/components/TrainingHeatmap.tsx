import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, dailyActivity, dayKey, startOfDay, startOfWeek } from '../core/activity';
import { pluralize } from '../core/format';
import type { Session } from '../core/types';

const WEEKS = 26;

/**
 * Grid of the last 26 weeks (columns are weeks, Mon–Sun): blue = trained, gray = rest.
 * Deliberately two states — unlike commits, you train at most once a day, and set counts
 * mostly reflect which workout it was rather than effort.
 */
export function TrainingHeatmap({ sessions }: { sessions: Session[] }) {
  const navigate = useNavigate();
  const activity = dailyActivity(sessions);
  const today = startOfDay(new Date());
  const firstMonday = addDays(startOfWeek(today), -7 * (WEEKS - 1));

  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)));

  // Label the first week of each month. A partial first month is dropped when the next month
  // starts within 3 columns, and labels never sit closer than 3 columns apart.
  const monthStarts = weeks.map((_, w) => w).filter((w) => w === 0 || weeks[w][0].getMonth() !== weeks[w - 1][0].getMonth());
  if (monthStarts[1] !== undefined && monthStarts[1] < 3) monthStarts.shift();
  const monthLabels = new Set<number>();
  for (const w of monthStarts) {
    if (w - Math.max(-Infinity, ...monthLabels) >= 3) monthLabels.add(w);
  }

  let sessionCount = 0;
  let activeDays = 0;
  for (const [key, day] of activity) {
    if (key >= dayKey(firstMonday) && key <= dayKey(today)) {
      sessionCount += day.sessions.length;
      activeDays += 1;
    }
  }
  const elapsedWeeks = Math.max(1, (today.getTime() - firstMonday.getTime()) / (7 * 86_400_000));

  return (
    <div>
      <div className="heatmap" style={{ gridTemplateColumns: `16px repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {/* Month labels on the first week of each month */}
        <span />
        {weeks.map((days, w) => (
          <span key={`m${w}`} className="heatmap-month">
            {monthLabels.has(w) ? days[0].toLocaleDateString(undefined, { month: 'short' }) : ''}
          </span>
        ))}

        {Array.from({ length: 7 }, (_, d) => renderRow(d))}
      </div>

      <div className="spread small muted" style={{ marginTop: 10 }}>
        <span className="tnum">
          {pluralize(sessionCount, 'session')} on {pluralize(activeDays, 'day')} · {(sessionCount / elapsedWeeks).toFixed(1)}/week
        </span>
        <span className="row" style={{ gap: 10 }} aria-hidden="true">
          <span className="row" style={{ gap: 4 }}>
            <span className="heat-cell" style={{ width: 10, height: 10 }} /> Rest
          </span>
          <span className="row" style={{ gap: 4 }}>
            <span className="heat-cell trained" style={{ width: 10, height: 10 }} /> Trained
          </span>
        </span>
      </div>
    </div>
  );

  function renderRow(d: number) {
    return (
      <Fragment key={d}>
        <span className="heatmap-day">{d % 2 === 0 ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d] : ''}</span>
        {weeks.map((days) => {
          const date = days[d];
          const key = dayKey(date);
          if (date > today) return <span key={key} />;
          const day = activity.get(key);
          const label = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${
            day ? `${day.sessions.map((s) => s.name).join(', ')} · ${pluralize(day.sets, 'set')}` : 'Rest'
          }`;
          return day ? (
            <button
              key={key}
              className="heat-cell trained"
              title={label}
              aria-label={label}
              onClick={() => navigate(`/session/${day.sessions[0].id}`)}
            />
          ) : (
            <span key={key} className="heat-cell" title={label} />
          );
        })}
      </Fragment>
    );
  }
}
