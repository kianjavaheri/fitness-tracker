import { ArrowDown, ArrowLeft, ArrowUp, Check, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { NotFound } from '../components/NotFound';
import { pluralize } from '../core/format';
import { newId, now } from '../core/ids';
import { cloneWorkout, nameTaken, uniqueName } from '../core/plan';
import { nextWorkoutInRoutine, WEEKDAYS } from '../core/stats';
import type { ID, Routine, Workout } from '../core/types';
import { PLAN_PATH } from '../config';
import { repo } from '../data';
import { useEditable } from '../hooks/useEditable';
import { useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';
import { move } from '../utils/array';

/** Monday-first display order of weekday numbers (0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RoutineEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const workouts = useWorkouts();
  const sessions = useSessions();
  const routines = useRoutines();
  const [adding, setAdding] = useState(false);
  // Picked a workout that's already in another routine: ask whether to share it or add a copy.
  const [sharing, setSharing] = useState<Workout | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const otherRoutines = (routines ?? []).filter((r) => r.id !== routine.id);
  const alsoIn = (workoutId: ID) => otherRoutines.filter((r) => r.workoutIds.includes(workoutId));
  // Workouts that would be left in no routine if this one went.
  const onlyHere = routine.workoutIds.filter((wid) => alsoIn(wid).length === 0 && workoutById.has(wid));

  const nameClash = nameTaken(routine.name, otherRoutines);
  const settleName = () => {
    const name = uniqueName(routine.name.trim() || 'Untitled routine', otherRoutines);
    if (name !== routine.name) update((r) => ({ ...r, name }));
  };

  const addWorkout = (workoutId: ID) => {
    update((r) => ({ ...r, workoutIds: [...r.workoutIds, workoutId] }));
    setAdding(false);
    setSharing(null);
  };

  const addCopy = async (w: Workout) => {
    const copy = cloneWorkout(w, workouts ?? []);
    await repo.saveWorkout(copy);
    addWorkout(copy.id);
  };

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
    const w: Workout = { id: newId(), name: uniqueName('New workout', workouts ?? []), exercises: [], createdAt: ts, updatedAt: ts };
    await repo.saveWorkout(w);
    update((r) => ({ ...r, workoutIds: [...r.workoutIds, w.id] }));
    navigate(`/edit/workouts/${w.id}?new=1&from=${encodeURIComponent(here)}`);
  };

  const remove = async (withWorkouts: boolean) => {
    await repo.deleteRoutine(routine.id);
    // Past sessions are kept either way; workouts still used by another routine are never deleted.
    if (withWorkouts) for (const wid of onlyHere) await repo.deleteWorkout(wid);
    navigate(PLAN_PATH, { replace: true });
  };

  return (
    <div className="narrow">
      <Link to={PLAN_PATH} className="back-link">
        <ArrowLeft size={15} /> Workouts
      </Link>
      <div className="row">
        <input
          ref={nameRef}
          className="title-input"
          value={routine.name}
          onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
          onBlur={settleName}
          aria-label="Routine name"
          aria-invalid={nameClash}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            settleName();
            navigate(PLAN_PATH);
          }}
        >
          <Check size={15} /> Save
        </button>
      </div>
      {nameClash && (
        <p className="name-clash small">
          You already have a routine called “{routine.name.trim()}”. This one will be saved as “{uniqueName(routine.name, otherRoutines)}”.
        </p>
      )}

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
        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
          <Trash2 size={14} /> Delete routine
        </button>
      </div>

      {adding && (
        <Modal title="Add workout" onClose={() => setAdding(false)}>
          {available.length === 0 && <p className="muted">Every workout is already in this routine.</p>}
          {available.map((w) => (
            <button key={w.id} className="list-row" onClick={() => {
                if (alsoIn(w.id).length === 0) return addWorkout(w.id);
                setAdding(false);
                setSharing(w);
              }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
                <div className="muted small">
                  {pluralize(w.exercises.length, 'exercise')}
                  {alsoIn(w.id).length > 0 && ` · in ${alsoIn(w.id).map((r) => r.name).join(', ')}`}
                </div>
              </div>
              <Plus size={16} className="muted" />
            </button>
          ))}
        </Modal>
      )}

      {sharing && (
        <Modal title={`Add “${sharing.name}”`} onClose={() => setSharing(null)}>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            It's already in {alsoIn(sharing.id).map((r) => r.name).join(', ')}.
          </p>
          <div className="stack" style={{ gap: 4, marginTop: 12, marginInline: -12 }}>
            <button className="list-row" onClick={() => addWorkout(sharing.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Use the same workout</div>
                <div className="muted small">Edits apply in every routine it's in, and its history stays together.</div>
              </div>
            </button>
            <button className="list-row" onClick={() => addCopy(sharing)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Add a copy</div>
                <div className="muted small">
                  “{uniqueName(sharing.name, [...(workouts ?? [])])}” starts as the same workout and can be changed on its own.
                </div>
              </div>
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title={`Delete “${routine.name}”?`} onClose={() => setDeleting(false)}>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            {onlyHere.length > 0
              ? `${pluralize(onlyHere.length, 'workout')} only used here: ${onlyHere.map((wid) => workoutById.get(wid)?.name).join(', ')}. ${onlyHere.length === 1 ? 'Keep it, or delete it' : 'Keep them, or delete them'} with the routine? Past sessions are kept either way.`
              : 'Its workouts are also in other routines, so they stay. Past sessions are kept.'}
          </p>
          <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
            <button className="btn btn-sm" autoFocus onClick={() => setDeleting(false)}>
              Cancel
            </button>
            {onlyHere.length > 0 ? (
              <>
                <button className="btn btn-sm" onClick={() => remove(false)}>
                  Delete routine only
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--danger)', color: 'var(--page-base)' }} onClick={() => remove(true)}>
                  Delete routine and workouts
                </button>
              </>
            ) : (
              <button className="btn btn-sm" style={{ background: 'var(--danger)', color: 'var(--page-base)' }} onClick={() => remove(false)}>
                Delete routine
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
