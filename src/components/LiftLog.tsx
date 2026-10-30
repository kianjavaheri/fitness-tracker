import { CalendarDays, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { exerciseDays } from '../core/activity';
import { formatDate } from '../core/format';
import { groupSets, type PastSets } from '../core/stats';
import type { Exercise, ID, Routine, Session, WeightUnit, Workout } from '../core/types';
import { formatWeight } from '../core/units';
import { DayCalendar } from './DayCalendar';
import { LogEntryForm } from './LogEntryForm';

/** What the table is for: a routine (a table per workout) or one workout. */
type Pick = { kind: 'routine' | 'workout'; id: ID };
const PICK_KEY = 'lifttrack:log-pick';

/** What was picked here, and the routine being followed then: "routine:id|followedId". */
function readPick(): { value: string; followedId: string } | null {
  try {
    const [value, followedId = ''] = localStorage.getItem(PICK_KEY)?.split('|') ?? [];
    return value ? { value, followedId } : null;
  } catch {
    return null;
  }
}

function savePick(pick: { value: string; followedId: string }) {
  try {
    localStorage.setItem(PICK_KEY, `${pick.value}|${pick.followedId}`);
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
  // A pick lasts until the followed routine changes: then the Log goes to that routine.
  const followedId = followed?.id ?? '';
  const [choice, setChoice] = useState(() => {
    const saved = readPick();
    return saved?.followedId === followedId ? saved : null;
  });
  const [lastFollowed, setLastFollowed] = useState(followedId);
  if (followedId !== lastFollowed) {
    setLastFollowed(followedId);
    setChoice(null);
  }
  /** A day picked from the calendar, per row (a workout's slot id: "YYYY-MM-DD"); otherwise the last day it was done. */
  const [days, setDays] = useState<Map<ID, string>>(() => new Map());
  const [calendarFor, setCalendarFor] = useState<ID | null>(null);
  /** The row whose numbers are being typed in (one not done yet, or one with no date). */
  const [entering, setEntering] = useState<{ slotId: ID; workout: Workout } | null>(null);

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
    parsed(choice?.value ?? null) ??
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
  const calendarLatest = calendarDays?.keys().next().value;

  const enteringSlot = entering?.workout.exercises.find((s) => s.id === entering.slotId);
  const enteringExercise = enteringSlot && exerciseById.get(enteringSlot.exerciseId);
  const enteringPast = entering && dayFor(entering.slotId)?.log;
  const enteringOccurrence = entering && enteringSlot ? entering.workout.exercises.slice(0, entering.workout.exercises.indexOf(enteringSlot)).filter((s) => s.exerciseId === enteringSlot.exerciseId).length : 0;
  const enteringEntries = enteringPast && enteringSlot ? (sessions.find((s) => s.id === enteringPast.sessionId)?.entries ?? []).filter((e) => e.exerciseId === enteringSlot.exerciseId) : [];

  return (
    <div className="lift-log">
      <label className="log-pick">
        <span className="muted small">Show</span>
        <select
          className="input"
          value={`${pick.kind}:${pick.id}`}
          onChange={(e) => {
            const next = { value: e.target.value, followedId };
            setChoice(next);
            savePick(next);
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
                    {day?.log.undated ? (
                      // Noted down or typed in without a date: none until it's done in the app. Tap to change them.
                      <button className="log-date no-date" onClick={() => setEntering({ slotId: slot.id, workout })} title="Change these numbers">
                        No date
                      </button>
                    ) : day ? (
                      <button className={`log-date dated${day.latest ? '' : ' picked'}`} onClick={() => setCalendarFor(slot.id)} title="Pick another day">
                        {shortDay(day.log.date)}
                        <CalendarDays size={13} />
                      </button>
                    ) : null}
                  </td>
                );
                // One body per exercise, so its rows stay together and the line only falls between exercises.
                return (
                  <tbody key={slot.id}>
                    {groups.length === 0 ? (
                      <tr>
                        {name}
                        <td colSpan={2} className="muted small log-not-done">
                          Not done
                        </td>
                        {/* Gray and wide, so it can't be taken for a date (those are rainbow). */}
                        <td colSpan={2} className="date">
                          <button className="log-date log-add" onClick={() => setEntering({ slotId: slot.id, workout })} aria-label={`Add sets, reps and weight for ${exercise?.name ?? 'this exercise'}`}>
                            <Plus size={13} /> Add
                          </button>
                        </td>
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

      {entering && enteringSlot && enteringExercise && (
        <LogEntryForm
          exercise={enteringExercise}
          workout={entering.workout}
          occurrence={enteringOccurrence}
          targetSets={enteringSlot.targetSets}
          unit={unit}
          existing={
            enteringPast
              ? {
                  sessionId: enteringPast.sessionId,
                  sets: enteringPast.sets,
                  perSide: !!(enteringEntries[enteringOccurrence] ?? enteringEntries[0])?.perSide,
                  date: enteringPast.undated ? null : enteringPast.date,
                }
              : undefined
          }
          onClose={() => setEntering(null)}
        />
      )}

      {calendarFor && calendarDays && (
        <DayCalendar
          title={calendarExercise?.name ?? 'Exercise'}
          days={new Set([...calendarDays].filter(([, log]) => !log.undated).map(([key]) => key))}
          selected={dayFor(calendarFor)?.key ?? null}
          latest={calendarLatest}
          onEdit={
            dayFor(calendarFor)?.log.imported
              ? () => {
                  const workout = shown.find((w) => w.exercises.some((s) => s.id === calendarFor));
                  if (workout) setEntering({ slotId: calendarFor, workout });
                  setCalendarFor(null);
                }
              : undefined
          }
          onPick={(key) => {
            // The latest day isn't a pick: it's what shows anyway, and it keeps following new workouts.
            setDays((prev) => {
              const next = new Map(prev);
              if (key === calendarLatest) next.delete(calendarFor);
              else next.set(calendarFor, key);
              return next;
            });
            setCalendarFor(null);
          }}
          onClose={() => setCalendarFor(null)}
        />
      )}
    </div>
  );
}
