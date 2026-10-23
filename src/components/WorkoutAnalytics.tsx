import { ArrowDown, ArrowUp, Equal } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatDateLong, pluralize } from '../core/format';
import { compareLastTwoSessions, indexedProgress } from '../core/stats';
import type { Exercise, ID, Session, WeightUnit, Workout } from '../core/types';
import { fromKg } from '../core/units';
import { CATEGORICAL, RANGES, rangeCutoff, type RangeKey } from './chartTheme';

/** More lines than this stop being readable, and the palette has no 9th colour. */
const MAX_SERIES = 8;

interface Props {
  workout: Workout;
  exercises: Map<ID, Exercise>;
  sessions: Session[];
  unit: WeightUnit;
  theme: 'light' | 'dark';
  range: RangeKey;
  onRange: (r: RangeKey) => void;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}%`;

export function WorkoutAnalytics({ workout, exercises, sessions, unit, theme, range, onRange }: Props) {
  const [hidden, setHidden] = useState<Set<ID>>(new Set());

  const ids = [...new Set(workout.exercises.map((x) => x.exerciseId))];
  const charted = ids.slice(0, MAX_SERIES);
  const isBodyweight = (id: ID) => exercises.get(id)?.kind === 'bodyweight';
  const name = (id: ID) => exercises.get(id)?.name ?? 'Unknown';
  const colors = CATEGORICAL[theme];
  const colorOf = (id: ID) => colors[charted.indexOf(id)];

  const series = indexedProgress(charted, sessions, isBodyweight, rangeCutoff(range));
  const withData = series.filter((s) => s.points.length > 1);
  const avgChange = withData.length ? withData.reduce((sum, s) => sum + s.change, 0) / withData.length : null;

  // One row per date, one column per exercise (gaps where it wasn't done that day).
  const rows = new Map<number, Record<string, number>>();
  for (const s of series) for (const p of s.points) rows.set(p.t, { ...(rows.get(p.t) ?? { t: p.t }), [s.exerciseId]: p.pct });
  const data = [...rows.values()].sort((a, b) => a.t - b.t);

  const comparison = compareLastTwoSessions(workout.id, ids, sessions, isBodyweight);
  const compared = comparison.rows.filter((r) => r.pct != null);
  const improved = compared.filter((r) => r.pct! > 0.05).length;
  const dropped = compared.filter((r) => r.pct! < -0.05).length;
  const workoutSessions = sessions.filter((s) => s.workoutId === workout.id && s.finishedAt).length;

  const formatValue = (id: ID, v: number | null) => {
    if (v == null) return '—';
    if (isBodyweight(id)) return `${v} reps`;
    return `${Math.round(fromKg(v, unit) * 10) / 10} ${unit}`;
  };

  return (
    <>
      <div className="spread">
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{workout.name}</h2>
        <span className="muted">{pluralize(workoutSessions, 'session')}</span>
      </div>

      <div className="grid-sm" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))' }}>
        <div className="stat">
          <div className="stat-label">Average change</div>
          <div className="stat-value">{avgChange == null ? '—' : signed(avgChange)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Up since last session</div>
          <div className="stat-value">
            {improved}
            <span className="stat-unit">of {compared.length}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Down since last session</div>
          <div className="stat-value" style={dropped ? { color: 'var(--danger)' } : undefined}>
            {dropped}
            <span className="stat-unit">of {compared.length}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, padding: '16px 14px 8px 4px' }}>
        <div className="spread" style={{ padding: '0 4px 0 14px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Change since first session</div>
            <div className="muted small">Est. 1RM for weighted exercises, total reps for bodyweight</div>
          </div>
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.key} className={r.key === range ? 'on' : ''} onClick={() => onRange(r.key)}>
                {r.key}
              </button>
            ))}
          </div>
        </div>

        <div className="legend" style={{ padding: '12px 4px 0 14px' }} role="group" aria-label="Exercises (tap to show or hide)">
          {charted.map((id) => {
            const off = hidden.has(id);
            const s = series.find((x) => x.exerciseId === id)!;
            return (
              <button
                key={id}
                className={`legend-item${off ? ' off' : ''}`}
                aria-pressed={!off}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              >
                <span className="legend-swatch" style={{ background: colorOf(id) }} />
                {name(id)}
                {s.points.length > 1 && <span className="muted tnum">{signed(s.change)}</span>}
              </button>
            );
          })}
        </div>
        {ids.length > MAX_SERIES && (
          <div className="muted small" style={{ padding: '6px 14px 0' }}>
            Charting the first {MAX_SERIES} exercises; all of them are in the list below.
          </div>
        )}

        <div style={{ height: 300, marginTop: 8 }}>
          {data.length === 0 ? (
            <div className="muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              No sessions in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 18, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <ReferenceLine y={0} stroke="var(--faint)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={data.length === 1 ? [data[0].t - 3 * 86_400_000, data[0].t + 3 * 86_400_000] : ['dataMin', 'dataMax']}
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
                  tickFormatter={(v: number) => signed(v)}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--faint)', strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const items = [...payload].filter((p) => typeof p.value === 'number').sort((a, b) => Number(b.value) - Number(a.value));
                    return (
                      <div className="chart-tooltip">
                        <div className="muted small" style={{ marginBottom: 4 }}>
                          {formatDateLong(new Date(Number(label)).toISOString())}
                        </div>
                        {items.map((p) => (
                          <div key={String(p.dataKey)} className="row small tnum" style={{ gap: 8, justifyContent: 'space-between' }}>
                            <span className="row" style={{ gap: 6 }}>
                              <span className="legend-swatch" style={{ background: colorOf(String(p.dataKey)) }} />
                              {name(String(p.dataKey))}
                            </span>
                            <strong>{signed(Number(p.value))}</strong>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {charted
                  .filter((id) => !hidden.has(id))
                  .map((id) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={colorOf(id)}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, fill: colorOf(id), stroke: 'var(--surface-ring)', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: colorOf(id), stroke: 'var(--surface-ring)', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3 className="section-title">Since last session</h3>
        {!comparison.previous ? (
          <div className="empty">Log this workout twice to compare sessions.</div>
        ) : (
          <>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {formatDate(comparison.latest!.startedAt)} compared with {formatDate(comparison.previous.startedAt)} · estimated 1RM (reps for
              bodyweight)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th className="hide-mobile">Before</th>
                    <th title="Est. 1RM, or reps for bodyweight">Latest</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.exerciseId}>
                      <td>{name(r.exerciseId)}</td>
                      <td className="hide-mobile muted">{formatValue(r.exerciseId, r.previous)}</td>
                      <td>{formatValue(r.exerciseId, r.current)}</td>
                      <td>
                        <Change pct={r.pct} skipped={r.current == null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

/** Direction is shown with an icon and words, never colour alone. */
function Change({ pct, skipped }: { pct: number | null; skipped: boolean }) {
  if (pct == null) return <span className="muted small">{skipped ? 'Skipped' : 'New'}</span>;
  if (pct > 0.05)
    return (
      <span className="change up">
        <ArrowUp size={13} /> {signed(pct)}
      </span>
    );
  if (pct < -0.05)
    return (
      <span className="change down">
        <ArrowDown size={13} /> {signed(pct)} · Down
      </span>
    );
  return (
    <span className="change same">
      <Equal size={13} /> Same
    </span>
  );
}
