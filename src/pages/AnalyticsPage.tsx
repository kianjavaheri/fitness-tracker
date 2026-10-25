import { ArrowUpRight, Search, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACCENT, RANGES, type RangeKey } from '../components/chartTheme';
import { RecordsList } from '../components/RecordsList';
import { WorkoutAnalytics } from '../components/WorkoutAnalytics';
import { PageSkeleton } from '../components/Skeleton';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatDateLong, formatNumber, pluralize, relativeDay } from '../core/format';
import { exerciseHistory, personalRecords, type ExercisePoint, type MetricKey } from '../core/stats';
import type { Exercise, WeightUnit } from '../core/types';
import { fromKg } from '../core/units';
import { useSettings } from '../hooks/settings';
import { useExercises, useSessions, useWorkouts } from '../hooks/useRepo';

const METRICS: { key: MetricKey; label: string; best: string; weight: boolean; hint: string }[] = [
  { key: 'topSetKg', label: 'Top set', best: 'Heaviest set', weight: true, hint: 'The heaviest weight you lifted each session, for any number of reps.' },
  {
    key: 'e1rmKg',
    label: 'Estimated 1RM',
    best: 'Best est. 1RM',
    weight: true,
    hint: 'The most you could likely lift once, from your best set: weight × (1 + reps ÷ 30). Puts different rep ranges on one scale, so 140 × 12 and 150 × 6 compare fairly. Less reliable above about 12 reps.',
  },
  {
    key: 'volumeKg',
    label: 'Volume',
    best: 'Best session volume',
    weight: true,
    hint: 'Sets × reps × weight, added up each session. Measures how much work you did, so it only compares fairly between sessions with similar reps; heavier, lower-rep days look lower.',
  },
  { key: 'totalReps', label: 'Total reps', best: 'Most reps in a session', weight: false, hint: 'All reps across every set each session. Most useful for bodyweight exercises.' },
];


function metricValue(p: ExercisePoint, key: MetricKey, unit: WeightUnit) {
  return key === 'totalReps' ? p[key] : fromKg(p[key], unit);
}

function formatMetric(v: number, key: MetricKey) {
  return key === 'volumeKg' || key === 'totalReps' ? formatNumber(v) : String(Math.round(v * 10) / 10);
}

export function AnalyticsPage() {
  const sessions = useSessions();
  const exercises = useExercises();
  const workouts = useWorkouts();
  const { settings, resolvedTheme } = useSettings();
  const [params, setParams] = useSearchParams();
  const mode = params.get('view') === 'records' ? 'records' : params.has('workout') || params.get('view') === 'workouts' ? 'workout' : 'exercise';
  const [query, setQuery] = useState('');
  const [metric, setMetric] = useState<MetricKey | null>(null);
  const [range, setRange] = useState<RangeKey>('All');

  // Exercises that have logged data, most recently trained first.
  const trained = useMemo(() => {
    if (!sessions || !exercises) return [];
    const lastTrained = new Map<string, string>();
    for (const s of sessions) {
      for (const e of s.entries) {
        if (e.sets.some((x) => x.reps && x.reps > 0) && !lastTrained.has(e.exerciseId)) lastTrained.set(e.exerciseId, s.startedAt);
      }
    }
    return exercises
      .filter((e) => lastTrained.has(e.id))
      .map((e) => ({ exercise: e, last: lastTrained.get(e.id)! }))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [sessions, exercises]);

  // Workouts that have been logged at least once, most recently done first.
  const trainedWorkouts = useMemo(() => {
    if (!sessions || !workouts) return [];
    const last = new Map<string, string>();
    for (const s of sessions) if (s.workoutId && s.finishedAt && !last.has(s.workoutId)) last.set(s.workoutId, s.startedAt);
    return workouts
      .filter((w) => last.has(w.id))
      .map((w) => ({ workout: w, last: last.get(w.id)! }))
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [sessions, workouts]);

  if (!sessions || !exercises || !workouts) return <PageSkeleton />;

  const q = query.trim().toLowerCase();
  const selectedId = params.get('exercise') ?? trained[0]?.exercise.id;
  const selected = exercises.find((e) => e.id === selectedId);
  const visible = trained.filter(({ exercise }) => exercise.name.toLowerCase().includes(q));
  const selectedWorkoutId = params.get('workout') ?? trainedWorkouts[0]?.workout.id;
  const selectedWorkout = workouts.find((w) => w.id === selectedWorkoutId);
  const visibleWorkouts = trainedWorkouts.filter(({ workout }) => workout.name.toLowerCase().includes(q));

  return (
    <>
      <div className="spread">
        <h1 className="title">Analytics</h1>
        <div className="segmented" role="tablist" aria-label="Analyze by">
          <button role="tab" aria-selected={mode === 'exercise'} className={mode === 'exercise' ? 'on' : ''} onClick={() => setParams({}, { replace: true })}>
            By exercise
          </button>
          <button
            role="tab"
            aria-selected={mode === 'workout'}
            className={mode === 'workout' ? 'on' : ''}
            onClick={() => setParams({ view: 'workouts' }, { replace: true })}
          >
            By workout
          </button>
          <button role="tab" aria-selected={mode === 'records'} className={mode === 'records' ? 'on' : ''} onClick={() => setParams({ view: 'records' }, { replace: true })}>
            Records
          </button>
        </div>
      </div>

      {mode === 'records' ? (
        <div className="section" style={{ marginTop: 24 }}>
          <RecordsList
            exercises={exercises}
            sessions={sessions}
            unit={settings.unit}
            onOpen={(id) => {
              setParams({ exercise: id });
              setMetric(null);
            }}
          />
        </div>
      ) : trained.length === 0 ? (
        <div className="empty section">
          Charts show up here once you've logged some sets.
        </div>
      ) : (
        <div className="analytics-layout section" style={{ marginTop: 24 }}>
          <aside className="analytics-side">
            <div className="search" style={{ marginBottom: 8 }}>
              <Search size={16} />
              <input className="input" placeholder="Filter" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="exercise-list">
              {mode === 'workout' &&
                visibleWorkouts.map(({ workout, last }) => (
                  <button
                    key={workout.id}
                    className={`list-row${workout.id === selectedWorkoutId ? ' selected' : ''}`}
                    onClick={() => setParams({ workout: workout.id }, { replace: true })}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{workout.name}</div>
                      <div className="muted small">{relativeDay(last)}</div>
                    </div>
                  </button>
                ))}
              {mode === 'exercise' && visible.map(({ exercise, last }) => (
                <button
                  key={exercise.id}
                  className={`list-row${exercise.id === selectedId ? ' selected' : ''}`}
                  onClick={() => {
                    setParams({ exercise: exercise.id }, { replace: true });
                    setMetric(null);
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{exercise.name}</div>
                    <div className="muted small">{relativeDay(last)}</div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div style={{ minWidth: 0 }}>
            {mode === 'workout' ? (
              selectedWorkout ? (
                <WorkoutAnalytics
                  key={selectedWorkout.id}
                  workout={selectedWorkout}
                  exercises={new Map(exercises.map((e) => [e.id, e]))}
                  sessions={sessions}
                  unit={settings.unit}
                  theme={resolvedTheme}
                  range={range}
                  onRange={setRange}
                />
              ) : (
                <div className="empty">Workouts show up here once you've logged one from a saved workout.</div>
              )
            ) : selected ? (
              <ExerciseAnalytics
                key={selected.id}
                exercise={selected}
                points={exerciseHistory(selected.id, sessions)}
                unit={settings.unit}
                color={ACCENT[resolvedTheme]}
                metric={metric ?? (selected.kind === 'bodyweight' ? 'totalReps' : 'e1rmKg')}
                onMetric={setMetric}
                range={range}
                onRange={setRange}
              />
            ) : (
              <div className="empty">That exercise has no data yet.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface ExerciseAnalyticsProps {
  exercise: Exercise;
  points: ExercisePoint[];
  unit: WeightUnit;
  color: string;
  metric: MetricKey;
  onMetric: (m: MetricKey) => void;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
}

function ExerciseAnalytics({ exercise, points, unit, color, metric, onMetric, range, onRange }: ExerciseAnalyticsProps) {
  const navigate = useNavigate();
  const pr = personalRecords(points);
  const meta = METRICS.find((m) => m.key === metric)!;
  const unitLabel = meta.weight ? unit : 'reps';

  const days = RANGES.find((r) => r.key === range)!.days;
  const cutoff = Date.now() - days * 86_400_000;
  const data = points
    .filter((p) => Date.parse(p.date) >= cutoff)
    .map((p) => ({ t: Date.parse(p.date), value: metricValue(p, metric, unit), point: p }));

  const first = data[0]?.value;
  const last = data.at(-1)?.value;
  const change = first != null && last != null && data.length > 1 ? last - first : null;

  return (
    <>
      <div className="spread">
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{exercise.name}</h2>
        <span className="muted">{pluralize(pr.sessions, 'session')}</span>
      </div>

      <div className="grid-sm" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))' }}>
        {METRICS.map((m) => (
          <button key={m.key} className={`stat${m.key === metric ? ' selected' : ''}`} onClick={() => onMetric(m.key)} aria-pressed={m.key === metric}>
            <div className="stat-label">{m.best}</div>
            <div className="stat-value">
              {formatMetric(m.key === 'totalReps' ? pr.totalReps : fromKg(pr[m.key], unit), m.key)}
              <span className="stat-unit">{m.weight ? unit : 'reps'}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14, padding: '16px 14px 8px 4px' }}>
        <div className="spread" style={{ padding: '0 6px 0 18px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {meta.label} <span className="muted" style={{ fontWeight: 500 }}>({unitLabel})</span>
            </div>
            <div className="muted small">{meta.hint}</div>
          </div>
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.key} className={r.key === range ? 'on' : ''} onClick={() => onRange(r.key)}>
                {r.key}
              </button>
            ))}
          </div>
        </div>

        {change != null && (
          <div className="row small" style={{ padding: '10px 14px 0', gap: 6 }}>
            <TrendingUp size={16} style={{ color: change >= 0 ? 'var(--success)' : 'var(--danger)', transform: change < 0 ? 'scaleY(-1)' : undefined }} />
            <span className="tnum">
              {change >= 0 ? '+' : '−'}
              {formatMetric(Math.abs(change), metric)} {unitLabel}
            </span>
            <span className="muted">over this range</span>
          </div>
        )}

        <div style={{ height: 280, marginTop: 8 }}>
          {data.length === 0 ? (
            <div className="muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              No sessions in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 18, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={data.length === 1 ? [data[0].t - 86_400_000 * 3, data[0].t + 86_400_000 * 3] : ['dataMin', 'dataMax']}
                  tickFormatter={(t: number) => formatDate(new Date(t).toISOString())}
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  padding={{ left: 12, right: 12 }}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => formatMetric(v, metric)}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--faint)', strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!active || !row) return null;
                    return (
                      <div className="chart-tooltip">
                        <div className="muted small">{formatDateLong(row.point.date)}</div>
                        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }} className="tnum">
                          {formatMetric(row.value, metric)} {unitLabel}
                        </div>
                        <div className="muted small">{pluralize(row.point.sets, 'set')}</div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 4, fill: color, stroke: 'var(--surface-ring)', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: color, stroke: 'var(--surface-ring)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3 className="section-title">
          Sessions
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Top set</th>
                <th>Est. 1RM</th>
                <th className="hide-mobile">Volume</th>
                <th>Reps</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.sessionId} className="clickable" onClick={() => navigate(`/session/${p.sessionId}`)}>
                  <td>{formatDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>
                    {formatMetric(fromKg(p.topSetKg, unit), 'topSetKg')} {unit}
                  </td>
                  <td>
                    {formatMetric(fromKg(p.e1rmKg, unit), 'e1rmKg')} {unit}
                  </td>
                  <td className="hide-mobile">
                    {formatMetric(fromKg(p.volumeKg, unit), 'volumeKg')} {unit}
                  </td>
                  <td>{p.totalReps}</td>
                  <td style={{ width: 28 }}>
                    <ArrowUpRight size={16} className="muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
