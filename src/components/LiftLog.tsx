import { CalendarDays } from 'lucide-react';
import { useMemo, useState } from 'react';
import { exerciseDays } from '../core/activity';
import { formatDate } from '../core/format';
import { groupSets, type PastSets } from '../core/stats';
import type { Exercise, ID, Routine, Session, WeightUnit, Workout } from '../core/types';
import { formatWeight } from '../core/units';
import { DayCalendar } from './DayCalendar';

/** What the table is for: a routine (a table per workout) or one workout. */
type Pick = { kind: 'routine' | 'workout'; id: ID };
const PICK_KEY = 'lifttrack:log-pick';

function readPick(): string | null {
  try {
    return localStorage.getItem(PICK_KEY);
  } catch {
    return null;
  }
}

function savePick(value: string) {
  try {
    localStorage.setItem(PICK_KEY, value);
  } catch {
    /* only a convenience */
  }
}

/** "Oct 22", with the year when it isn't this year. */
const shortDay = (iso: string) =>
  formatDate(iso, new Date(iso).getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });

interface LiftLogProps {
  routines: Routine[];
  workouts: Workout[];
  exercises: Exercise[];
  sessions: Session[];
  unit: WeightUnit;
  /** The routine being followed, picked first when nothing was chosen on this device. */
  followed: Routine | null;
}

/**
 * Analytics → Log: plain tables of what was lifted, like a notes app. Pick a routine or a workout; each exercise
 * shows its sets, reps and weight from the last day it was done. Tap the date for a calendar with every day it was
 * done highlighted, and pick one to see that day's numbers instead.
 */
export function LiftLog({ routines, workouts, exercises, sessions, unit, followed }: LiftLogProps) {
  const [choice, setChoice] = useState(() => readPick());
  /** A day picked from the calendar, per row (a workout's slot id: "YYYY-MM-DD"); otherwise the last day it was done. */
  const [days, setDays] = useState<Map<ID, string>>(() => new Map());
  const [calendarFor, setCalendarFor] = useState<ID | null>(null);

  const workoutById = useMemo(() => new Map(workouts.map((w) => [w.id, w])), [workouts]);
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  // What was picked, if it still exists; else the followed routine, else the first routine or workout.
  const parsed = (value: string | null): Pick | null => {
    const [kind, id] = value?.split(':') ?? [];
    if (kind === 'routine' && routines.some((r) => r.id === id)) return { kind, id };
    if (kind === 'workout' && workoutById.has(id)) return { kind, id };
    return null;
  };
  const pick: Pick | null =
    parsed(choice) ??
    (followed ? { kind: 'routine', id: followed.id } : routines[0] ? { kind: 'routine', id: routines[0].id } : workouts[0] ? { kind: 'workout', id: workouts[0].id } : null);

  const pickKey = pick ? `${pick.kind}:${pick.id}` : '';
  // The workouts shown (a routine's in order), and every day each of their rows was done, by slot id. An exercise in
  // a workout twice keeps each appearance's sets apart.
  const { shown, history } = useMemo(() => {
    const [kind, id] = pickKey.split(':');
    const shown =
      kind === 'routine'
        ? (routines.find((r) => r.id === id)?.workoutIds ?? []).map((w) => workoutById.get(w)).filter((w): w is Workout => !!w)
        : workoutById.has(id)
          ? [workoutById.get(id)!]
          : [];
    const history = new Map<ID, Map<string, PastSets>>();
    for (const w of shown) {
      const twice = new Set(w.exercises.map((s) => s.exerciseId).filter((id, i, all) => all.indexOf(id) !== i));
      w.exercises.forEach((slot, i) => {
        const occurrence = w.exercises.slice(0, i).filter((s) => s.exerciseId === slot.exerciseId).length;
        history.set(slot.id, exerciseDays(slot.exerciseId, sessions, twice.has(slot.exerciseId) ? occurrence : undefined));
      });
    }
    return { shown, history };
  }, [pickKey, routines, workoutById, sessions]);

  if (!pick) return <div className="empty">Make a workout first, then its lifts show up here.</div>;

  const dayFor = (slotId: ID) => {
    const all = history.get(slotId);
    const picked = days.get(slotId);
    if (picked && all?.has(picked)) return { key: picked, latest: false, log: all.get(picked)! };
    const [key, log] = all?.entries().next().value ?? [];
    return key && log ? { key, latest: true, log } : null;
  };

  const calendarSlot = calendarFor ? shown.flatMap((w) => w.exercises).find((s) => s.id === calendarFor) : undefined;
  const calendarExercise = calendarSlot ? exerciseById.get(calendarSlot.exerciseId) : undefined;
  const calendarDays = calendarFor ? history.get(calendarFor) : undefined;

  return (
    <div className="lift-log">
      <label className="log-pick">
        <span className="muted small">Show</span>
        <select
          className="input"
          value={`${pick.kind}:${pick.id}`}
          onChange={(e) => {
            setChoice(e.target.value);
            savePick(e.target.value);
          }}
        >
          {routines.length > 0 && (
            <optgroup label="Routines">
              {routines.map((r) => (
                <option key={r.id} value={`routine:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Workouts">
            {workouts.map((w) => (
              <option key={w.id} value={`workout:${w.id}`}>
                {w.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      {shown.length === 0 && <div className="empty">This routine has no workouts yet.</div>}
      {shown.map((workout) => (
        <section key={workout.id} className="log-workout">
          {pick.kind === 'routine' && <h3 className="section-title">{workout.name}</h3>}
          {workout.exercises.length === 0 ? (
            <div className="muted small">No exercises in this workout yet.</div>
          ) : (
            <table className="table log-table">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th className="num">Sets</th>
                  <th className="num">Reps</th>
                  <th className="num">Weight</th>
                  <th className="date">Date</th>
                </tr>
              </thead>
              {workout.exercises.map((slot) => {
                const exercise = exerciseById.get(slot.exerciseId);
                const bodyweight = exercise?.kind === 'bodyweight';
                const day = dayFor(slot.id);
                const groups = day ? groupSets(day.log.sets) : [];
                const rows = Math.max(1, groups.length);
                const name = (
                  <td rowSpan={rows} className="log-name">
                    {exercise?.name ?? 'Unknown exercise'}
                  </td>
                );
                const date = (
                  <td rowSpan={rows} className="date">
                    {day ? (
                      <button className={`log-date${day.latest ? '' : ' picked'}`} onClick={() => setCalendarFor(slot.id)} title="Pick another day">
                        {shortDay(day.log.date)}
                        <CalendarDays size={13} />
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
                // One body per exercise, so its rows stay together and the line only falls between exercises.
                return (
                  <tbody key={slot.id}>
                    {groups.length === 0 ? (
                      <tr>
                        {name}
                        <td colSpan={3} className="muted small">
                          Not done yet
                        </td>
                        {date}
                      </tr>
                    ) : (
                      groups.map((g, i) => (
                        <tr key={i}>
                          {i === 0 && name}
                          <td className="num">{g.count}</td>
                          <td className="num">{g.reps}</td>
                          <td className="num">{g.weightKg ? `${bodyweight ? '+' : ''}${formatWeight(g.weightKg, unit)} ${unit}` : bodyweight ? 'BW' : '—'}</td>
                          {i === 0 && date}
                        </tr>
                      ))
                    )}
                  </tbody>
                );
              })}
            </table>
          )}
        </section>
      ))}

      {calendarFor && calendarDays && (
        <DayCalendar
          title={calendarExercise?.name ?? 'Exercise'}
          days={new Set(calendarDays.keys())}
          selected={dayFor(calendarFor)?.key ?? null}
          onPick={(key) => {
            setDays((prev) => new Map(prev).set(calendarFor, key));
            setCalendarFor(null);
          }}
          onClose={() => setCalendarFor(null)}
        />
      )}
    </div>
  );
}
