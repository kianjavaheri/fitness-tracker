import { addDays, dailyActivity, dayKey, plannedOn, startOfWeek } from '../core/activity';
import type { Routine, Session, Workout } from '../core/types';
import { useOpenDay } from './DaySessions';

/** Mon–Sun of the current week: filled dot = trained, ring = planned, today highlighted. */
export function WeekStrip({ sessions, routines, workouts }: { sessions: Session[]; routines: Routine[]; workouts: Workout[] }) {
  const [openDay, daySummary] = useOpenDay(sessions);
  const today = new Date();
  const todayKey = dayKey(today);
  const monday = startOfWeek(today);
  const activity = dailyActivity(sessions);
  const workoutName = new Map(workouts.map((w) => [w.id, w.name]));

  return (
    <div className="week" role="list" aria-label="This week">
      {daySummary}
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const key = dayKey(date);
        const done = activity.get(key);
        const planned = plannedOn(date, routines).map((p) => workoutName.get(p.workoutId)).filter(Boolean);
        const isToday = key === todayKey;
        const isPast = key < todayKey;
        const status = done
          ? `Trained: ${done.sessions.map((s) => s.name).join(', ')}`
          : planned.length
            ? `${isPast ? 'Planned (missed)' : 'Planned'}: ${planned.join(', ')}`
            : 'Rest';
        const label = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${status}`;
        return (
          <button
            key={key}
            role="listitem"
            className={`week-day${isToday ? ' today' : ''}`}
            title={label}
            aria-label={label}
            disabled={!done}
            onClick={() => done && openDay(date, done)}
          >
            <span className="week-name">{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            <span className="week-date tnum">{date.getDate()}</span>
            <span className={`week-mark${done ? ' done' : planned.length ? ' planned' : ''}`} />
          </button>
        );
      })}
    </div>
  );
}
