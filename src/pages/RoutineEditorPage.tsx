import { ArrowDown, ArrowLeft, ArrowUp, Check, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { NotFound } from '../components/NotFound';
import { pluralize } from '../core/format';
import { newId, now } from '../core/ids';
import { nextWorkoutInRoutine, WEEKDAYS } from '../core/stats';
import type { ID, Routine, Workout } from '../core/types';
import { repo } from '../data';
import { useEditable } from '../hooks/useEditable';
import { useSessions, useWorkouts } from '../hooks/useRepo';
import { move } from '../utils/array';

/** Monday-first display order of weekday numbers (0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RoutineEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const workouts = useWorkouts();
  const sessions = useSessions();
  const [adding, setAdding] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const [routine, update] = useEditable<Routine>(
    () => repo.getRoutine(id),
    (r) => repo.saveRoutine({ ...r, updatedAt: now() }),
    [id],
  );

  const isNew = params.get('new') === '1';
  useEffect(() => {
    if (isNew && routine) nameRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, routine?.id]);

  if (routine === undefined) return null;
  if (routine === null) return <NotFound />;

  const here = `/edit/routines/${routine.id}`;
  const workoutById = new Map(workouts?.map((w) => [w.id, w]));
  const upNext = sessions ? nextWorkoutInRoutine(routine, sessions) : null;
  const available = (workouts ?? []).filter((w) => !routine.workoutIds.includes(w.id));

  const toggleDay = (workoutId: ID, day: number) =>
    update((r) => {
      const current = r.days?.[workoutId] ?? [];
      const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
      return { ...r, days: { ...r.days, [workoutId]: next } };
    });

  const removeWorkout = (workoutId: ID) =>
    update((r) => {
      const days = { ...r.days };
      delete days[workoutId];
      return { ...r, workoutIds: r.workoutIds.filter((x) => x !== workoutId), days };
    });

  const createWorkoutInRoutine = async () => {
    const ts = now();
    const w: Workout = { id: newId(), name: 'New workout', exercises: [], createdAt: ts, updatedAt: ts };
    await repo.saveWorkout(w);
    update((r) => ({ ...r, workoutIds: [...r.workoutIds, w.id] }));
    navigate(`/edit/workouts/${w.id}?new=1&from=${encodeURIComponent(here)}`);
  };

  const remove = async () => {
    if (!confirm(`Delete routine “${routine.name}”? Its workouts are kept.`)) return;
    await repo.deleteRoutine(routine.id);
    navigate('/edit', { replace: true });
  };

  return (
    <div className="narrow">
      <Link to="/edit" className="back-link">
        <ArrowLeft size={15} /> Edit workouts
      </Link>
      <div className="row">
        <input
          ref={nameRef}
          className="title-input"
          value={routine.name}
          onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
          onBlur={() => !routine.name.trim() && update((r) => ({ ...r, name: 'Untitled routine' }))}
          aria-label="Routine name"
        />
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/edit')}>
          <Check size={15} /> Save
        </button>
      </div>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          {routine.workoutIds.length === 0 && <div className="empty">No workouts in this routine yet.</div>}
          {routine.workoutIds.map((wid, i) => {
            const w = workoutById.get(wid);
            const days = routine.days?.[wid] ?? [];
            return (
              <div key={wid} className="card" style={{ padding: '12px 14px' }}>
                <div className="spread" style={{ flexWrap: 'nowrap' }}>
                  <Link to={`/edit/workouts/${wid}?from=${encodeURIComponent(here)}`} className="row" style={{ minWidth: 0, gap: 8 }}>
                    <span className="set-num">{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{w?.name ?? 'Unknown'}</span>
                    <span className="muted small">{pluralize(w?.exercises.length ?? 0, 'exercise')}</span>
                    {upNext === wid && <span className="badge">Up next</span>}
                  </Link>
                  <div className="row" style={{ gap: 0 }}>
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      onClick={() => update((r) => ({ ...r, workoutIds: move(r.workoutIds, i, i - 1) }))}
                      aria-label="Move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === routine.workoutIds.length - 1}
                      onClick={() => update((r) => ({ ...r, workoutIds: move(r.workoutIds, i, i + 1) }))}
                      aria-label="Move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button className="icon-btn" onClick={() => removeWorkout(wid)} aria-label="Remove from routine">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="days" style={{ marginTop: 10 }} role="group" aria-label={`Days for ${w?.name ?? 'workout'}`}>
                  {WEEK_ORDER.map((d) => (
                    <button key={d} className={`day${days.includes(d) ? ' on' : ''}`} onClick={() => toggleDay(wid, d)} aria-pressed={days.includes(d)}>
                      {WEEKDAYS[d]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="row-wrap">
            <button className="btn btn-sm" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add workout
            </button>
            <button className="btn btn-ghost btn-sm" onClick={createWorkoutInRoutine}>
              <Plus size={15} /> New workout
            </button>
          </div>
        </div>
      </section>

      <div className="section">
        <button className="btn btn-danger btn-sm" onClick={remove}>
          <Trash2 size={14} /> Delete routine
        </button>
      </div>

      {adding && (
        <Modal title="Add workout" onClose={() => setAdding(false)}>
          {available.length === 0 && <p className="muted">Every workout is already in this routine.</p>}
          {available.map((w) => (
            <button
              key={w.id}
              className="list-row"
              onClick={() => {
                update((r) => ({ ...r, workoutIds: [...r.workoutIds, w.id] }));
                setAdding(false);
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
                <div className="muted small">{pluralize(w.exercises.length, 'exercise')}</div>
              </div>
              <Plus size={16} className="muted" />
            </button>
          ))}
        </Modal>
      )}
    </div>
  );
}
