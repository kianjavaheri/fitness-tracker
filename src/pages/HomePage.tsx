import { ChartLine, History, Play, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { TrainingHeatmap } from '../components/TrainingHeatmap';
import { WeekStrip } from '../components/WeekStrip';
import { PLAN_PATH } from '../config';
import { dailyActivity, dayKey } from '../core/activity';
import { formatTime, pluralize } from '../core/format';
import { createSessionFromWorkout } from '../core/sessions';
import { followedRoutine, nextWorkoutInRoutine, scheduledOn } from '../core/stats';
import type { Workout } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useExercises, useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';

const HUB: { to: string; label: string; icon: ReactNode; primary?: boolean }[] = [
  { to: '/check-in', label: 'Check in', icon: <Plus size={28} />, primary: true },
  { to: '/workouts', label: 'Workouts', icon: <History size={24} /> },
  { to: '/analytics', label: 'Analytics', icon: <ChartLine size={24} /> },
];

export function HomePage() {
  const navigate = useNavigate();
  const sessions = useSessions();
  const routines = useRoutines();
  const workouts = useWorkouts();
  const exercises = useExercises();
  const { settings } = useSettings();

  if (!sessions || !routines || !workouts || !exercises) return null;

  const active = sessions.find((s) => !s.finishedAt);
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  const doneToday = dailyActivity(sessions).get(dayKey(new Date()));

  // Only the routine being followed plans the week; several at once would overlap.
  const followed = followedRoutine(routines, settings.activeRoutineId);
  const nextWorkout = followed ? workoutById.get(nextWorkoutInRoutine(followed, sessions) ?? '') : undefined;
  const plannedToday = !!(followed && nextWorkout && scheduledOn(followed).includes(nextWorkout.id));

  const start = async (workout: Workout, routineId: string) => {
    const session = createSessionFromWorkout(workout, routineId);
    await repo.saveSession(session);
    navigate(`/session/${session.id}`);
  };

  return (
    <>
      <nav className="hub" aria-label="Main">
        {HUB.map((item, i) => (
          <Link key={item.to} to={item.to} className="hub-item">
            <span className={`orb${item.primary ? ' primary' : ''}`} style={{ animationDelay: `${i * -1.3}s` }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      {active && (
        <section className="section">
          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="spread">
              <div>
                <span className="badge">In progress</span>
                <div className="card-title" style={{ marginTop: 8 }}>
                  {active.name}
                </div>
                <div className="card-body small">
                  {active.live === false ? 'Logging for' : 'Started'} {formatTime(active.startedAt)} ·{' '}
                  {pluralize(active.entries.length, 'exercise')}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <CancelWorkoutButton session={active} label="Cancel" />
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/session/${active.id}`)}>
                  Resume
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="home-grid section">
        <section>
          <h2 className="section-title">This week</h2>
          <WeekStrip sessions={sessions} routines={followed ? [followed] : []} workouts={workouts} />

          {doneToday && (
            <p className="muted small" style={{ marginTop: 14 }}>
              Trained today: {doneToday.sessions.map((s) => s.name).join(', ')}
            </p>
          )}

          {!active && (
            <div className="stack" style={{ marginTop: 14, gap: 10 }}>
              {followed && nextWorkout && (
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="badge">{plannedToday ? 'Today' : 'Up next'}</span>
                        <span className="muted small">{followed.name}</span>
                      </div>
                      <div className="card-title" style={{ marginTop: 6 }}>
                        {nextWorkout.name}
                      </div>
                      <div className="card-body clamp-4 small">
                        {nextWorkout.exercises.map((x) => exerciseName.get(x.exerciseId)).join(' · ') || 'No exercises yet'}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => start(nextWorkout, followed.id)}
                      disabled={nextWorkout.exercises.length === 0}
                    >
                      <Play size={13} /> Start
                    </button>
                  </div>
                </div>
              )}
              {!nextWorkout && routines.length > 1 && !followed && (
                <p className="muted small">
                  You have more than one routine. Pick the one you're following in{' '}
                  <Link to={PLAN_PATH} style={{ textDecoration: 'underline' }}>
                    Workouts → Plan
                  </Link>{' '}
                  to plan your week here.
                </p>
              )}
              {!nextWorkout && (routines.length <= 1 || followed) && (
                <p className="muted small">
                  Nothing planned. Pick days for your workouts in{' '}
                  <Link to={PLAN_PATH} style={{ textDecoration: 'underline' }}>
                    Workouts → Plan
                  </Link>{' '}
                  to see them here.
                </p>
              )}
            </div>
          )}
        </section>

        <section>
          <TrainingHeatmap sessions={sessions} />
        </section>
      </div>
    </>
  );
}
