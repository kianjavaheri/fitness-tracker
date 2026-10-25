import { PencilLine, Play } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { DateTimeFields } from '../components/DateTimeFields';
import { PageSkeleton } from '../components/Skeleton';
import { WorkoutActions, type Held } from '../components/WorkoutActions';
import { pluralize, relativeDay } from '../core/format';
import { createFreestyleSession, createSessionFromWorkout, isImportedSession, type LogTiming } from '../core/sessions';
import { followedRoutine, nextWorkoutInRoutine, plannedToday, routinesContaining } from '../core/stats';
import type { ID, Workout } from '../core/types';
import { useSettings } from '../hooks/settings';
import { useLongPress } from '../hooks/useLongPress';
import { useExercises, useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';
import { useStartSession } from '../hooks/useStartSession';

export function CheckInPage() {
  const navigate = useNavigate();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const sessions = useSessions();
  const exercises = useExercises();
  const { settings } = useSettings();
  const start = useStartSession();
  const [live, setLive] = useState(true);
  const [when, setWhen] = useState(() => new Date().toISOString());
  const [held, setHeld] = useState<Held<Workout> | null>(null);
  const hold = useLongPress(setHeld);

  if (!workouts || !routines || !sessions || !exercises) return <PageSkeleton />;

  const active = sessions.find((s) => !s.finishedAt);
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  // The routine being followed comes first and is the only one with Today / Up next badges.
  const followed = followedRoutine(routines, settings.activeRoutineId);
  const ordered = followed ? [followed, ...routines.filter((r) => r.id !== followed.id)] : routines;
  const standalone = workouts.filter((w) => routinesContaining(w.id, routines).length === 0);
  const lastDone = (workoutId: ID) => sessions.find((s) => s.workoutId === workoutId && s.finishedAt && !isImportedSession(s));
  const timing = (): LogTiming => (live ? { live: true } : { live: false, startedAt: when });


  const workoutCard = (workout: Workout, routineId: ID | null, badge?: string) => {
    const last = lastDone(workout.id);
    return (
      <button
        key={workout.id}
        className="card holdable"
        style={badge ? { borderColor: 'var(--accent)' } : undefined}
        {...hold(workout)}
        onClick={() => start(createSessionFromWorkout(workout, routineId, timing()))}
        disabled={workout.exercises.length === 0}
      >
        <div className="row" style={{ gap: 8 }}>
          <span className="card-title">{workout.name}</span>
          {badge && <span className="badge">{badge}</span>}
        </div>
        <div className="card-body clamp-4 small" style={{ paddingRight: 24 }}>
          {workout.exercises.length === 0 ? 'No exercises yet' : workout.exercises.map((we) => exerciseName.get(we.exerciseId)).join(' · ')}
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          {last ? `Last done ${relativeDay(last.startedAt, true)}` : 'Not done yet'}
        </div>
        <Play className="card-arrow" size={16} />
      </button>
    );
  };

  return (
    <>
      <h1 className="title">Check in</h1>

      {active && (
        <div className="card section" style={{ borderColor: 'var(--accent)', marginTop: 20 }}>
          <div className="spread">
            <div>
              <span className="badge">In progress</span>
              <div className="card-title" style={{ marginTop: 6 }}>
                {active.name}
              </div>
              <div className="card-body small">{pluralize(active.entries.length, 'exercise')}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <CancelWorkoutButton session={active} label="Cancel" />
              <button className="btn btn-primary btn-sm" onClick={() => navigate(`/session/${active.id}`)}>
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="well" style={{ marginTop: 20 }}>
        <label className="row" style={{ cursor: 'pointer' }}>
          <button type="button" className={`switch${live ? ' on' : ''}`} role="switch" aria-checked={live} onClick={() => setLive(!live)} />
          <span>
            <span style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>Log live</span>
            <span className="muted small">{live ? 'Starts now, with a timer' : 'Logging a workout you already did'}</span>
          </span>
        </label>
        {!live && (
          <div style={{ marginTop: 14 }}>
            <DateTimeFields value={when} onChange={setWhen} />
          </div>
        )}
      </div>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="grid">
          <button className="card" onClick={() => start(createFreestyleSession(timing()))}>
            <div className="row" style={{ gap: 8 }}>
              <PencilLine size={16} />
              <span className="card-title">Freestyle</span>
            </div>
            <div className="card-body small">No plan. Add exercises as you go.</div>
            <Play className="card-arrow" size={16} />
          </button>
        </div>
      </section>

      {ordered
        .filter((r) => r.workoutIds.length > 0)
        .map((r) => {
          const isFollowed = r.id === followed?.id;
          const next = isFollowed ? nextWorkoutInRoutine(r, sessions) : null;

          return (
            <section key={r.id} className="section" style={{ marginTop: 26 }}>
              <h2 className="section-title">
                {r.name}
                {isFollowed && routines.length > 1 && <span className="muted small" style={{ fontWeight: 500, marginLeft: 8 }}>Following</span>}
              </h2>
              <div className="grid">
                {r.workoutIds.map((wid) => {
                  const w = workoutById.get(wid);
                  if (!w) return null;
                  const badge = isFollowed && plannedToday(r, wid, sessions) ? 'Today' : wid === next ? 'Up next' : undefined;
                  return workoutCard(w, r.id, badge);
                })}
              </div>
            </section>
          );
        })}

      {standalone.length > 0 && (
        <section className="section" style={{ marginTop: 26 }}>
          <h2 className="section-title">Other workouts</h2>
          <div className="grid">{standalone.map((w) => workoutCard(w, null))}</div>
        </section>
      )}
      {held && <WorkoutActions held={held} workouts={workouts} routines={routines} exercises={exercises} onClose={() => setHeld(null)} />}
    </>
  );
}
