import { ChartLine, Dumbbell, NotebookText, Play, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AccountButton } from '../components/AccountButton';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { TrainingHeatmap } from '../components/TrainingHeatmap';
import { WeekStrip } from '../components/WeekStrip';
import { RecentWorkouts } from './WorkoutLogPage';
import { PageSkeleton } from '../components/Skeleton';
import { useAuth } from '../auth/AuthProvider';
import { PLAN_PATH } from '../config';
import { dailyActivity, dayKey, plannedThisWeek, weekSoFar } from '../core/activity';
import { formatTime, pluralize, upcomingDay } from '../core/format';
import { createSessionFromWorkout } from '../core/sessions';
import { followedRoutine, nextPlannedDay, nextWorkoutInRoutine, plannedToday } from '../core/stats';
import type { Session, Workout } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useExercises, useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';

const HUB: { to: string; label: string; icon: ReactNode; primary?: boolean }[] = [
  { to: '/check-in', label: 'Check in', icon: <Plus size={28} />, primary: true },
  { to: '/workouts', label: 'Workouts', icon: <Dumbbell size={24} /> },
  { to: '/analytics', label: 'Analytics', icon: <ChartLine size={24} /> },
  { to: '/log', label: 'Log', icon: <NotebookText size={24} /> },
];

// A few ways to say hello for each part of the day, followed by ", <first name>" when signed in.
const GREETINGS = {
  morning: ['Good morning', 'Morning', 'Rise and shine'],
  afternoon: ['Good afternoon', 'Hey there', 'Afternoon'],
  evening: ['Good evening', 'Evening', 'Hey there'],
  night: ['Up late', 'Still up', 'Good evening'],
};

/**
 * A greeting for the time of day, sometimes the weekday ("Happy Friday"). Picked from the date and part of the day,
 * so it stays the same each time Home is drawn and changes from one day to the next.
 */
function greeting(date: Date) {
  const h = date.getHours();
  const part = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 ? 'evening' : 'night';
  const options = [...GREETINGS[part]];
  if (part !== 'night') options.push(`Happy ${date.toLocaleDateString('en-US', { weekday: 'long' })}`);
  const seed = date.getFullYear() * 400 + date.getMonth() * 31 + date.getDate() + part.length;
  return options[seed % options.length];
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessions = useSessions();
  const routines = useRoutines();
  const workouts = useWorkouts();
  const exercises = useExercises();
  const { settings } = useSettings();

  if (!sessions || !routines || !workouts || !exercises) return <PageSkeleton title={false} />;

  const active = sessions.find((s) => !s.finishedAt);
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  const doneToday = dailyActivity(sessions).get(dayKey(new Date()));

  // Only the routine being followed plans the week; several at once would overlap.
  const followed = followedRoutine(routines, settings.activeRoutineId);
  const nextWorkout = followed ? workoutById.get(nextWorkoutInRoutine(followed, sessions) ?? '') : undefined;
  const isPlannedToday = !!(followed && nextWorkout && plannedToday(followed, nextWorkout.id, sessions));
  // On an "every N days" schedule, when it's next due ("Up next · Saturday" on a rest day).
  const interval = followed && nextWorkout && (followed.rotateEvery || followed.every?.[nextWorkout.id]);
  const nextDay = interval ? nextPlannedDay(followed, nextWorkout.id, sessions) : null;

  const start = async (workout: Workout, routineId: string) => {
    const session = createSessionFromWorkout(workout, routineId, { live: true }, sessions);
    await repo.saveSession(session);
    navigate(`/session/${session.id}`);
  };

  const today = new Date();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <>
      {/* In the app, where the top bar and these shortcuts give way to the tab bar, Home opens with a greeting. */}
      <header className="home-greeting page-head">
        <div className="page-head-main">
          <h1 className="title">
            {greeting(today)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <div className="muted small">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <AccountButton />
      </header>
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
          <div className="card rb-outline">
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

          <WeekSummary sessions={sessions} planned={plannedThisWeek(followed, sessions)} />
          {doneToday && (
            <p className="muted small" style={{ marginTop: 6 }}>
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
                        <span className="badge">{isPlannedToday ? 'Today' : 'Up next'}</span>
                        <span className="muted small">
                          {followed.name}
                          {nextDay && !isPlannedToday ? ` · ${upcomingDay(nextDay)}` : ''}
                        </span>
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
                    Workouts
                  </Link>{' '}
                  to plan your week here.
                </p>
              )}
              {!nextWorkout && (routines.length <= 1 || followed) && (
                <p className="muted small">
                  Nothing planned. Pick days for your workouts in{' '}
                  <Link to={PLAN_PATH} style={{ textDecoration: 'underline' }}>
                    Workouts
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

      <RecentWorkouts />
    </>
  );
}

/** Under "This week": "2 of 3 planned · 24 sets · ↑ 6 vs last week", compared with last week up to the same day. */
function WeekSummary({ sessions, planned }: { sessions: Session[]; planned: number }) {
  const { thisWeek, lastWeek } = weekSoFar(sessions);
  if (thisWeek.workouts === 0 && lastWeek.workouts === 0 && planned === 0) return null;
  const delta = thisWeek.sets - lastWeek.sets;
  return (
    <p className="small tnum week-summary">
      <strong>{planned ? `${thisWeek.workouts} of ${planned} planned` : pluralize(thisWeek.workouts, 'workout')}</strong> ·{' '}
      {pluralize(thisWeek.sets, 'set')}
      {lastWeek.sets > 0 && delta !== 0 && (
        <span className={delta > 0 ? 'change up' : 'change same'}>
          {' '}
          · {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} vs last week
        </span>
      )}
    </p>
  );
}
