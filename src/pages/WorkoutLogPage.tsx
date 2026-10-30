import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatDuration, formatNumber, pluralize } from '../core/format';
import { isImportedSession, loggedEntries, sessionDurationMinutes } from '../core/sessions';
import { sessionSummary } from '../core/stats';
import type { Session, WeightUnit } from '../core/types';
import { fromKg } from '../core/units';
import { useSettings } from '../hooks/settings';
import { useExercises, useSessions } from '../hooks/useRepo';
import { PageSkeleton } from '../components/Skeleton';
import { SessionActions, type Held } from '../components/WorkoutActions';
import { useLongPress } from '../hooks/useLongPress';
import { canGoBack } from '../utils/history';

/** Home's "Recent workouts": the last few logged sessions, and a way to all of them. */
export function RecentWorkouts({ count = 4 }: { count?: number }) {
  // Workouts only: numbers typed into the Log or noted down are Log-only records.
  const sessions = useSessions()?.filter((s) => !isImportedSession(s));
  const exercises = useExercises();
  const { settings } = useSettings();
  const [held, setHeld] = useState<Held<Session> | null>(null);
  const hold = useLongPress(setHeld);
  if (!sessions || !exercises || sessions.length === 0) return null;

  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  return (
    <section className="section">
      <div className="spread">
        <h2 className="section-title" style={{ margin: 0 }}>
          Recent workouts
        </h2>
        <Link to="/history" className="see-all">
          See all <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        {sessions.slice(0, count).map((s) => (
          <SessionCard key={s.id} session={s} exerciseName={exerciseName} unit={settings.unit} hold={hold} />
        ))}
      </div>
      {held && <SessionActions held={held} onClose={() => setHeld(null)} />}
    </section>
  );
}

/** History (`/history`, from "See all" on Home): every logged session, by month. */
export function HistoryPage() {
  const navigate = useNavigate();
  return (
    <>
      <button className="back-link" onClick={() => (canGoBack() ? navigate(-1) : navigate('/', { replace: true }))}>
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="title">History</h1>
      <WorkoutHistory />
    </>
  );
}

/** Logged sessions by month. */
function WorkoutHistory() {
  const sessions = useSessions()?.filter((s) => !isImportedSession(s));
  const exercises = useExercises();
  const { settings } = useSettings();
  const [held, setHeld] = useState<Held<Session> | null>(null);
  const hold = useLongPress(setHeld);
  if (!sessions || !exercises) return <PageSkeleton title={false} />;

  const exerciseName = new Map(exercises.map((e) => [e.id, e.name]));
  const byMonth = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = formatDate(s.startedAt, { month: 'long', year: 'numeric' });
    byMonth.set(key, [...(byMonth.get(key) ?? []), s]);
  }

  return (
    <>
      {sessions.length === 0 && (
        <div className="empty section" style={{ marginTop: 24 }}>
          Nothing logged yet. Check in to log your first workout.
        </div>
      )}

      {[...byMonth.entries()].map(([month, list], i) => (
        <section key={month} className="section" style={i === 0 ? { marginTop: 24 } : undefined}>
          <h2 className="section-title">{month}</h2>
          <div className="grid">
            {list.map((s) => (
              <SessionCard key={s.id} session={s} exerciseName={exerciseName} unit={settings.unit} hold={hold} />
            ))}
          </div>
        </section>
      ))}
      {held && <SessionActions held={held} onClose={() => setHeld(null)} />}
    </>
  );
}

/** A logged session: its day, name, exercises, sets, volume and time. Press and hold for its menu. */
function SessionCard({
  session: s,
  exerciseName,
  unit,
  hold,
}: {
  session: Session;
  exerciseName: Map<string, string>;
  unit: WeightUnit;
  hold: ReturnType<typeof useLongPress<Session>>;
}) {
  const sum = sessionSummary(s);
  const minutes = sessionDurationMinutes(s);
  return (
                <Link to={`/session/${s.id}`} className="card holdable" style={{ padding: '14px 16px' }} {...hold(s)}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <div className="well" style={{ padding: '6px 10px', textAlign: 'center', minWidth: 48 }}>
                      <div className="muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10 }}>
                        {formatDate(s.startedAt, { weekday: 'short' })}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{new Date(s.startedAt).getDate()}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="card-title" style={{ fontSize: 16 }}>
                          {s.name}
                        </span>
                        {!s.finishedAt && <span className="badge">In progress</span>}
                      </div>
                      <div className="card-body clamp-4 small" style={{ marginTop: 2 }}>
                        {(s.finishedAt ? loggedEntries(s) : s.entries).map((e) => exerciseName.get(e.exerciseId)).join(' · ') || 'Nothing logged'}
                      </div>
                      <div className="row-wrap small muted tnum" style={{ gap: 12, marginTop: 8 }}>
                        <span>{pluralize(sum.sets, 'set')}</span>
                        <span>
                          {formatNumber(fromKg(sum.volumeKg, unit))} {unit}
                        </span>
                        {minutes != null && <span>{formatDuration(minutes)}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
  );
}
