import { ArrowDown, ArrowLeft, ArrowUp, ChartLine, Check, Plus, Repeat, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { DateTimeFields } from '../components/DateTimeFields';
import { ExercisePicker } from '../components/ExercisePicker';
import { DEFAULT_SETS } from '../config';
import { NotFound } from '../components/NotFound';
import { NumericInput } from '../components/NumericInput';
import { formatDateLong, formatDuration, formatNumber, formatTime, relativeDay } from '../core/format';
import { emptySet, finalizeSession, newEntry } from '../core/sessions';
import { isCompletedSet, lastPerformance, lastPerformanceWithDate, sessionSummary, type PastPerformance } from '../core/stats';
import type { Exercise, Session, SessionEntry, SetLog, WeightUnit } from '../core/types';
import { formatWeight, fromKg, parseWeightInput } from '../core/units';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useEditable } from '../hooks/useEditable';
import { useExercises, useSessions } from '../hooks/useRepo';
import { move } from '../utils/array';

type Picking = { mode: 'add' } | { mode: 'swap'; entryId: string } | null;

export function SessionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const exercises = useExercises();
  const sessions = useSessions();
  const [picking, setPicking] = useState<Picking>(null);

  const [session, update] = useEditable<Session>(() => repo.getSession(id), (s) => repo.saveSession(s), [id]);

  if (session === undefined) return null;
  if (session === null) return <NotFound />;

  const exerciseById = new Map(exercises?.map((e) => [e.id, e]));
  const inProgress = !session.finishedAt;
  const live = session.live !== false;
  const summary = sessionSummary(session);

  const updateEntry = (entryId: string, fn: (e: SessionEntry) => SessionEntry) =>
    update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)) }));

  const finish = async () => {
    if (summary.sets === 0) {
      alert('Nothing is logged yet. Fill in at least one set, or use Cancel workout to discard it.');
      return;
    }
    await repo.saveSession(finalizeSession(session));
    navigate('/workouts');
  };

  const deleteFinished = async () => {
    if (!confirm('Delete this session from your history?')) return;
    await repo.deleteSession(session.id);
    navigate('/workouts', { replace: true });
  };

  return (
    <div className="narrow">
      <div className="spread" style={{ marginBottom: 14 }}>
        <Link to={inProgress ? '/' : '/workouts'} className="back-link" style={{ margin: 0 }}>
          <ArrowLeft size={15} /> {inProgress ? 'Home' : 'Workouts'}
        </Link>
        {inProgress && (
          <CancelWorkoutButton session={session} onCancelled={() => navigate('/', { replace: true })} />
        )}
      </div>

      <div className="row-wrap small" style={{ marginBottom: 4 }}>
        {inProgress ? <span className="badge">{live ? '● Live' : 'Logging'}</span> : <span className="chip small">Done</span>}
        <span className="muted">
          {formatDateLong(session.startedAt)} · {formatTime(session.startedAt)}
          {inProgress && live && (
            <>
              {' '}
              · <Elapsed since={session.startedAt} />
            </>
          )}
        </span>
      </div>
      <input
        className="title-input"
        value={session.name}
        onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
        onBlur={() => !session.name.trim() && update((s) => ({ ...s, name: 'Workout' }))}
        aria-label="Session name"
      />
      {(!live || !inProgress) && (
        <div style={{ marginTop: 12 }}>
          <DateTimeFields
            value={session.startedAt}
            onChange={(startedAt) => {
              const shift = Date.parse(startedAt) - Date.parse(session.startedAt);
              update((s) => ({
                ...s,
                startedAt,
                finishedAt: s.finishedAt ? new Date(Date.parse(s.finishedAt) + shift).toISOString() : null,
              }));
            }}
          />
        </div>
      )}

      <div className="stack" style={{ marginTop: 22, gap: 12 }}>
        {session.entries.length === 0 && (
          <div className="empty">
            Nothing logged yet.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setPicking({ mode: 'add' })}>
                <Plus size={15} /> Add exercise
              </button>
            </div>
          </div>
        )}
        {session.entries.map((entry, i) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            exercise={exerciseById.get(entry.exerciseId)}
            last={sessions ? lastPerformanceWithDate(entry.exerciseId, sessions, session.id) : null}
            unit={settings.unit}
            isFirst={i === 0}
            isLast={i === session.entries.length - 1}
            onChange={(fn) => updateEntry(entry.id, fn)}
            onMove={(dir) => update((s) => ({ ...s, entries: move(s.entries, i, i + dir) }))}
            onRemove={() => {
              const logged = entry.sets.some(isCompletedSet);
              if (logged && !confirm('Remove this exercise and its logged sets?')) return;
              update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== entry.id) }));
            }}
            onSwap={() => setPicking({ mode: 'swap', entryId: entry.id })}
          />
        ))}
      </div>

      <div className="sticky-bar">
        <div className="small tnum" style={{ minWidth: 0 }}>
          <strong>{summary.sets}</strong> <span className="muted">sets</span> · <strong>{formatNumber(fromKg(summary.volumeKg, settings.unit))}</strong>{' '}
          <span className="muted">{settings.unit}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setPicking({ mode: 'add' })}>
            <Plus size={15} /> Exercise
          </button>
          {inProgress ? (
            <button className="btn btn-primary btn-sm" onClick={finish}>
              <Check size={15} /> {live ? 'Finish' : 'Save'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/workouts')}>
              Done
            </button>
          )}
        </div>
      </div>

      {!inProgress && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-danger btn-sm" onClick={deleteFinished}>
            <Trash2 size={14} /> Delete session
          </button>
        </div>
      )}

      {picking && (
        <ExercisePicker
          title={picking.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}
          selectedIds={session.entries.map((e) => e.exerciseId)}
          onClose={() => setPicking(null)}
          onPick={(ex) => {
            if (picking.mode === 'swap') {
              updateEntry(picking.entryId, (e) => ({ ...e, exerciseId: ex.id }));
            } else {
              const prevCount = sessions ? lastPerformance(ex.id, sessions, session.id).length : 0;
              update((s) => ({ ...s, entries: [...s.entries, newEntry(ex.id, prevCount || DEFAULT_SETS)] }));
            }
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

interface EntryCardProps {
  entry: SessionEntry;
  exercise: Exercise | undefined;
  last: PastPerformance | null;
  unit: WeightUnit;
  isFirst: boolean;
  isLast: boolean;
  onChange: (fn: (e: SessionEntry) => SessionEntry) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
}

function EntryCard({ entry, exercise, last, unit, isFirst, isLast, onChange, onMove, onRemove, onSwap }: EntryCardProps) {
  const bodyweight = exercise?.kind === 'bodyweight';
  const previous = last?.sets ?? [];

  const setSet = (setId: string, patch: Partial<SetLog>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  /**
   * Suggested values for set i. Weight follows the set above when it's filled in this session
   * (so a mid-session jump carries forward); reps follow the same set last time.
   */
  const hint = (i: number): Pick<SetLog, 'weightKg' | 'reps'> | undefined => {
    const above = i > 0 ? entry.sets[i - 1] : undefined;
    const before = previous[i] ?? previous.at(-1);
    if (!above && !before) return undefined;
    return {
      weightKg: above?.weightKg ?? before?.weightKg ?? null,
      reps: before?.reps ?? above?.reps ?? null,
    };
  };

  const toggleDone = (set: SetLog, i: number) => {
    if (set.done) return setSet(set.id, { done: false });
    const h = hint(i);
    const reps = set.reps ?? h?.reps ?? null;
    const weightKg = set.weightKg ?? h?.weightKg ?? null;
    if (!reps) return; // nothing to complete yet
    setSet(set.id, { done: true, reps, weightKg });
  };

  const addSet = () =>
    onChange((e) => {
      const last = e.sets.at(-1);
      return { ...e, sets: [...e.sets, { ...emptySet(), weightKg: last?.weightKg ?? null }] };
    });

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ fontSize: 16 }}>
            {exercise?.name ?? 'Unknown exercise'}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {[entry.targetSets ? `Target ${entry.targetSets} × ${entry.targetReps || '—'}` : null, last ? `Last done ${relativeDay(last.date, true)}` : 'First time']
              .filter(Boolean)
              .join(' · ')}
          </div>
          {entry.notes && (
            <div className="small" style={{ marginTop: 4 }}>
              {entry.notes}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 0, margin: '-4px -6px 0 0' }}>
          <Link to={`/analytics?exercise=${entry.exerciseId}`} className="icon-btn hide-mobile" aria-label="Analytics">
            <ChartLine size={15} />
          </Link>
          <button className="icon-btn" onClick={onSwap} aria-label="Swap exercise" title="Swap exercise">
            <Repeat size={15} />
          </button>
          <button className="icon-btn hide-mobile" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp size={15} />
          </button>
          <button className="icon-btn hide-mobile" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown size={15} />
          </button>
          <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="set-grid" style={{ marginTop: 12 }}>
        <span className="head">Set</span>
        <span className="head">Previous</span>
        <span className="head" style={{ textAlign: 'center' }}>
          {bodyweight ? '+ Weight' : 'Weight'}
        </span>
        <span className="head" style={{ textAlign: 'center' }}>
          Reps
        </span>
        <span />
        <span />
        {entry.sets.map((set, i) => {
          const h = hint(i);
          return (
            <div key={set.id} className={`set-row${set.done ? ' done' : ''}`} style={{ display: 'contents' }}>
              <span className="set-num">{i + 1}</span>
              <span className="prev tnum" title={previous[i] ? `Set ${i + 1} last time` : undefined}>
                {previous[i] ? (
                  <>
                    <span>{bodyweight && !previous[i].weightKg ? 'BW' : formatWeight(previous[i].weightKg, unit)}</span>
                    <span>× {previous[i].reps}</span>
                  </>
                ) : (
                  '—'
                )}
              </span>
              <div className="affix">
                <NumericInput
                  className="set-input"
                  decimal
                  ariaLabel={`Set ${i + 1} weight in ${unit}`}
                  value={set.weightKg}
                  placeholder={h?.weightKg != null ? formatWeight(h.weightKg, unit) : bodyweight ? 'BW' : '0'}
                  format={(v) => (v == null ? '' : formatWeight(v, unit))}
                  parse={(t) => parseWeightInput(t, unit)}
                  onChange={(weightKg) => setSet(set.id, { weightKg })}
                />
                <span className="suffix">{unit}</span>
              </div>
              <NumericInput
                className="set-input"
                ariaLabel={`Set ${i + 1} reps`}
                value={set.reps}
                placeholder={h?.reps != null ? String(h.reps) : entry.targetReps?.split(/\D/)[0] || '0'}
                format={(v) => (v == null ? '' : String(v))}
                parse={(t) => (t ? parseInt(t, 10) : null)}
                onChange={(reps) => setSet(set.id, { reps, done: reps ? set.done : false })}
              />
              <button
                className={`check${set.done ? ' on' : ''}`}
                onClick={() => toggleDone(set, i)}
                aria-label={set.done ? `Mark set ${i + 1} not done` : `Complete set ${i + 1}`}
                aria-pressed={set.done}
              >
                <Check size={17} />
              </button>
              <button
                className="icon-btn"
                style={{ width: 28 }}
                onClick={() => onChange((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== set.id) }))}
                aria-label={`Delete set ${i + 1}`}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, marginLeft: -6 }} onClick={addSet}>
        <Plus size={14} /> Add set
      </button>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return <>{formatDuration(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60000)))}</>;
}
