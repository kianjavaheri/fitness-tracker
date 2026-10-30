import { ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Plus, Share, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DeleteRoutineDialog } from '../components/DeleteRoutineDialog';
import { NewWorkoutWindow } from '../components/NewWorkout';
import { Modal } from '../components/Modal';
import { NotFound } from '../components/NotFound';
import { PageSkeleton } from '../components/Skeleton';
import { Stepper } from '../components/Stepper';
import { pluralize, upcomingDay } from '../core/format';
import { now } from '../core/ids';
import { cloneWorkout, nameTaken, uniqueName } from '../core/plan';
import { routinePayload } from '../core/share';
import { nextPlannedDay, nextWorkoutInRoutine, WEEKDAYS } from '../core/stats';
import type { ID, Routine, Workout } from '../core/types';
import { PLAN_PATH } from '../config';
import { repo } from '../data';
import { useDragReorder } from '../hooks/useDragReorder';
import { useEditable } from '../hooks/useEditable';
import { useExercises, useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';
import { useShareLink } from '../hooks/useShareLink';
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
  const exercises = useExercises();
  const shareLink = useShareLink();
  const [adding, setAdding] = useState(false);
  /** "New workout": the window to name it and pick its exercises; it joins this routine. */
  const [creating, setCreating] = useState(false);
  // Picked a workout that's already in another routine: ask whether to share it or add a copy.
  const [sharing, setSharing] = useState<Workout | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const [routine, update] = useEditable<Routine>(
    () => repo.getRoutine(id),
    (r) => repo.saveRoutine({ ...r, updatedAt: now() }),
    [id],
  );

  // Hold a workout and drag it to reorder the routine.
  const reorder = useDragReorder(routine?.workoutIds.length ?? 0, (from, to) => update((r) => ({ ...r, workoutIds: move(r.workoutIds, from, to) })));

  const isNew = params.get('new') === '1';
  useEffect(() => {
    if (isNew && routine) nameRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, routine?.id]);

  if (routine === undefined) return <PageSkeleton />;
  if (routine === null) return <NotFound />;

  const here = `/edit/routines/${routine.id}`;
  const workoutById = new Map(workouts?.map((w) => [w.id, w]));
  const upNext = sessions ? nextWorkoutInRoutine(routine, sessions) : null;
  const available = (workouts ?? []).filter((w) => !routine.workoutIds.includes(w.id));
  const otherRoutines = (routines ?? []).filter((r) => r.id !== routine.id);
  const alsoIn = (workoutId: ID) => otherRoutines.filter((r) => r.workoutIds.includes(workoutId));

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
      const every = { ...r.every };
      delete every[workoutId];
      return { ...r, workoutIds: r.workoutIds.filter((x) => x !== workoutId), days, every };
    });

  /** A workout every N days, or back to its weekdays (null; those are kept meanwhile). */
  const setEvery = (workoutId: ID, n: number | null) =>
    update((r) => {
      const every = { ...r.every };
      if (n) every[workoutId] = n;
      else delete every[workoutId];
      return { ...r, every };
    });
  /** The whole routine in rotation, one workout every N days, or back to per-workout days (null). */
  const setRotation = (n: number | null) =>
    update((r) => {
      const { rotateEvery: _old, ...rest } = r;
      return n ? { ...rest, rotateEvery: n } : rest;
    });

  const rotating = !!routine.rotateEvery;
  const rotationNames = routine.workoutIds.map((id) => workoutById.get(id)?.name ?? 'Unknown');
  // "Push · rest · Pull · rest · repeat": what the rotation comes to.
  const restWord = routine.rotateEvery === 1 ? null : routine.rotateEvery === 2 ? 'rest' : `${(routine.rotateEvery ?? 1) - 1} rest days`;
  const rotationPreview = [...rotationNames.flatMap((name) => (restWord ? [name, restWord] : [name])), 'repeat'].join(' · ');
  const nextIn = (wid: ID) => {
    const day = sessions ? nextPlannedDay(routine, wid, sessions) : null;
    return day ? upcomingDay(day) : null;
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
        {/* Changes save as they're made; this just leaves. */}
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            settleName();
            navigate(PLAN_PATH);
          }}
        >
          <Check size={15} /> Done
        </button>
      </div>
      {nameClash && (
        <p className="name-clash small">
          You already have a routine called “{routine.name.trim()}”. This one will be named “{uniqueName(routine.name, otherRoutines)}”.
        </p>
      )}

      <section className="section" style={{ marginTop: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          {routine.workoutIds.length === 0 && <div className="empty">No workouts in this routine yet.</div>}
          {routine.workoutIds.length > 0 && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="spread">
                <div style={{ fontWeight: 600, fontSize: 15 }}>Schedule</div>
                <div className="segmented">
                  <button className={rotating ? '' : 'on'} onClick={() => setRotation(null)}>
                    By day
                  </button>
                  <button className={rotating ? 'on' : ''} onClick={() => !rotating && setRotation(2)}>
                    In rotation
                  </button>
                </div>
              </div>
              {rotating ? (
                <>
                  <div className="schedule-every" style={{ marginTop: 10 }}>
                    <span>One workout every</span>
                    <Stepper label="days between workouts" value={routine.rotateEvery ?? 2} min={1} max={14} onChange={setRotation} />
                    <span>{routine.rotateEvery === 1 ? 'day' : 'days'}</span>
                  </div>
                  <p className="muted small" style={{ margin: '8px 0 0' }}>
                    {rotationPreview}
                  </p>
                  {upNext && (
                    <p className="small" style={{ margin: '4px 0 0' }}>
                      Next: {workoutById.get(upNext)?.name}
                      {nextIn(upNext) ? `, ${nextIn(upNext)}` : ''}
                    </p>
                  )}
                </>
              ) : (
                <p className="muted small" style={{ margin: '8px 0 0' }}>
                  Pick days for each workout, or repeat one every few days.
                </p>
              )}
            </div>
          )}
          {routine.workoutIds.map((wid, i) => {
            const w = workoutById.get(wid);
            const days = routine.days?.[wid] ?? [];
            return (
              <div key={wid} ref={reorder.itemRef(i)} className="card" style={{ padding: '12px 14px' }}>
                <div className="spread holdable" style={{ flexWrap: 'nowrap' }} {...reorder.handle(i)}>
                  <Link to={`/edit/workouts/${wid}?from=${encodeURIComponent(here)}`} className="row" style={{ minWidth: 0, gap: 8 }}>
                    <span className="set-num">{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{w?.name ?? 'Unknown'}</span>
                    <span className="muted small">{pluralize(w?.exercises.length ?? 0, 'exercise')}</span>
                    {upNext === wid && <span className="badge">Up next</span>}
                  </Link>
                  <div className="row" style={{ gap: 0, flexShrink: 0 }}>
                    <Link to={`/edit/workouts/${wid}?from=${encodeURIComponent(here)}`} className="icon-btn" aria-label={`Edit ${w?.name ?? 'workout'}`} title="Edit">
                      <Pencil size={15} />
                    </Link>
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
                {rotating ? null : routine.every?.[wid] ? (
                  <div className="schedule-every" style={{ marginTop: 10 }}>
                    <span>Every</span>
                    <Stepper label={`days between ${w?.name ?? 'workout'}`} value={routine.every[wid]} min={1} max={30} onChange={(n) => setEvery(wid, n)} />
                    <span>{routine.every[wid] === 1 ? 'day' : 'days'}</span>
                    {nextIn(wid) && <span className="muted small">Next: {nextIn(wid)}</span>}
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEvery(wid, null)}>
                      Pick days
                    </button>
                  </div>
                ) : (
                  <div className="days" style={{ marginTop: 10 }} role="group" aria-label={`Days for ${w?.name ?? 'workout'}`}>
                    {WEEK_ORDER.map((d) => (
                      <button key={d} className={`day${days.includes(d) ? ' on' : ''}`} onClick={() => toggleDay(wid, d)} aria-pressed={days.includes(d)}>
                        {WEEKDAYS[d]}
                      </button>
                    ))}
                    <button className="day day-every" onClick={() => setEvery(wid, 2)} title="Repeat it every few days instead of on set days">
                      Every…
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="row-wrap">
            <button className="btn btn-sm" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add workout
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
              <Plus size={15} /> New workout
            </button>
          </div>
        </div>
      </section>

      <div className="row-wrap section" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(true)}>
          <Trash2 size={14} /> Delete routine
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => shareLink(routine.name, routinePayload(routine, workouts ?? [], new Map((exercises ?? []).map((e) => [e.id, e]))))}
          disabled={routine.workoutIds.length === 0}
        >
          <Share size={14} /> Share
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

      {creating && <NewWorkoutWindow routine={routine} from={here} onClose={() => setCreating(false)} />}
      {deleting && (
        <DeleteRoutineDialog
          routine={routine}
          routines={routines ?? []}
          workouts={workouts ?? []}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate(PLAN_PATH, { replace: true })}
        />
      )}
    </div>
  );
}
