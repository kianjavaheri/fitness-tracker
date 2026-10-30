import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Pencil, Play, Plus, Share, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExerciseForm } from '../components/ExerciseForm';
import { useFeedback } from '../components/Feedback';
import { ExercisePicker } from '../components/ExercisePicker';
import { NotFound } from '../components/NotFound';
import { NotesButton, WorkoutNotepad } from '../components/Notes';
import { SupersetButton, SupersetPill, usePills } from '../components/SupersetLink';
import { Stepper } from '../components/Stepper';
import { PageSkeleton } from '../components/Skeleton';
import { DEFAULT_REPS, DEFAULT_SETS, PLAN_PATH } from '../config';
import { newId, now } from '../core/ids';
import { cloneWorkout, nameTaken, uniqueName } from '../core/plan';
import { createSessionFromWorkout } from '../core/sessions';
import { shareableWorkout } from '../core/share';
import { groupBounds, leaveSuperset, moveIntoSuperset, moveUnlinked, placeAfter, removeUnlinked, restoreLinks, supersetGroups, supersetWith } from '../core/supersets';
import type { Exercise, Workout } from '../core/types';
import { repo } from '../data';
import { useDragReorder } from '../hooks/useDragReorder';
import { useSlotFlip } from '../hooks/useSlotFlip';
import { useEditable } from '../hooks/useEditable';
import { ExercisePhotos, ExerciseThumb, hasMedia } from '../components/ExercisePhoto';
import { useExerciseMedia } from '../hooks/useCatalog';
import { useExercises, useRoutines, useWorkouts } from '../hooks/useRepo';
import { useShareLink } from '../hooks/useShareLink';
import { useStartSession } from '../hooks/useStartSession';
import { safeReturnPath } from '../utils/history';

export function WorkoutEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const exercises = useExercises();
  const routines = useRoutines();
  const workouts = useWorkouts();
  const startSession = useStartSession();
  const shareLink = useShareLink();
  const { notify } = useFeedback();
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<Exercise | null>(null);
  /** The library exercise whose photos are open. */
  const [photosOf, setPhotosOf] = useState<Exercise | null>(null);
  const mediaFor = useExerciseMedia();
  const [notesOpen, setNotesOpen] = useState(false);
  // Superset pills show under every exercise here at first (so the feature is easy to find); the link button hides one.
  const pills = usePills(true);
  /** The exercise whose Superset pill was tapped: search for one to superset with it. */
  const [supersetFor, setSupersetFor] = useState<string | null>(null);
  /** Slides exercises to their new places when they go into or out of a superset. */
  const flip = useSlotFlip();
  /**
   * Where an exercise pulled into a superset came from (the id of the one before it, null if first), so taking it out
   * puts it back there. Forgotten once it's moved by hand.
   */
  const origins = useRef(new Map<string, string | null>());
  const rememberOrigin = (items: Workout['exercises'], index: number) => {
    const id = items[index]?.id;
    if (id && !origins.current.has(id)) origins.current.set(id, items[index - 1]?.id ?? null);
  };
  const nameRef = useRef<HTMLInputElement>(null);

  // Where to return on Done / back: the routine this was opened from, or the workouts list.
  const from = safeReturnPath(params.get('from'), PLAN_PATH);
  const backLabel = from.startsWith('/edit/routines/') ? 'Routine' : 'Workouts';

  const [workout, update] = useEditable<Workout>(
    () => repo.getWorkout(id),
    (w) => repo.saveWorkout({ ...w, updatedAt: now() }),
    [id],
  );

  // Hold an exercise and drag it to change the order, or drop it on a Superset pill to link it there.
  const reorder = useDragReorder(
    workout?.exercises.length ?? 0,
    (from, to) => {
      const id = workout?.exercises[from]?.id;
      if (id) origins.current.delete(id);
      update((w) => ({ ...w, exercises: moveUnlinked(w.exercises, from, to) }));
    },
    (from, host) => {
      if (workout) rememberOrigin(workout.exercises, from);
      flip();
      update((w) => ({ ...w, exercises: moveIntoSuperset(w.exercises, from, host) }));
    },
  );

  const isNew = params.get('new') === '1';
  useEffect(() => {
    if (isNew && workout) nameRef.current?.select();
    // Only on first load of a freshly created workout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, workout?.id]);

  if (workout === undefined) return <PageSkeleton />;
  if (workout === null) return <NotFound />;

  const exerciseById = new Map(exercises?.map((e) => [e.id, e]));

  const setSlot = (slotId: string, patch: Partial<Workout['exercises'][number]>) =>
    update((w) => ({ ...w, exercises: w.exercises.map((x) => (x.id === slotId ? { ...x, ...patch } : x)) }));

  const toggleRoutine = (routineId: string) => {
    const r = routines?.find((x) => x.id === routineId);
    if (!r) return;
    const workoutIds = r.workoutIds.includes(workout.id)
      ? r.workoutIds.filter((w) => w !== workout.id)
      : [...r.workoutIds, workout.id];
    void repo.saveRoutine({ ...r, workoutIds, updatedAt: now() });
  };

  // Names are unique: a blank or taken name becomes the next free one ("Upper A 2") when you leave the field or save.
  const others = workouts ?? [];
  const nameClash = nameTaken(workout.name, others, workout.id);
  const settleName = () => {
    const name = uniqueName(workout.name.trim() || 'Untitled workout', others, workout.id);
    if (name !== workout.name) update((w) => ({ ...w, name }));
  };

  // Every change is saved as it's made, so this only settles the name and leaves.
  const done = () => {
    settleName();
    navigate(from);
  };

  // Opened from a routine that shares this workout with other routines: the copy replaces it in that routine only.
  const fromRoutineId = /^\/edit\/routines\/([^/?]+)/.exec(from)?.[1];
  const fromRoutine = routines?.find((r) => r.id === fromRoutineId);
  const sharedElsewhere = (routines ?? []).filter((r) => r.id !== fromRoutineId && r.workoutIds.includes(workout.id));

  const duplicate = async () => {
    const copy = cloneWorkout(workout, others);
    await repo.saveWorkout(copy);
    if (fromRoutine && sharedElsewhere.length > 0) {
      const days = { ...fromRoutine.days };
      if (days[workout.id]) {
        days[copy.id] = days[workout.id];
        delete days[workout.id];
      }
      const workoutIds = fromRoutine.workoutIds.map((x) => (x === workout.id ? copy.id : x));
      await repo.saveRoutine({ ...fromRoutine, workoutIds, days, updatedAt: now() });
    }
    navigate(`/edit/workouts/${copy.id}?from=${encodeURIComponent(from)}`, { replace: true });
  };

  const start = () => startSession(createSessionFromWorkout(workout, null));

  // Deletes at once and offers Undo (which also puts it back in the routines it was in, with their planned days).
  const remove = async () => {
    const deleted = workout;
    const inRoutines = (routines ?? []).filter((r) => r.workoutIds.includes(deleted.id));
    await repo.deleteWorkout(deleted.id);
    navigate(from, { replace: true });
    notify(`Deleted “${deleted.name}”`, {
      undo: async () => {
        await repo.saveWorkout(deleted);
        for (const r of inRoutines) await repo.saveRoutine({ ...r, updatedAt: now() });
      },
    });
  };

  /** The link button: takes an exercise out of its superset (with Undo), or shows / hides its Superset pill. */
  const supersetButton = (we: Workout['exercises'][number], i: number) => {
    const [start, end] = groupBounds(workout.exercises, i);
    const inSuperset = end > start;
    return (
      <SupersetButton
        inSuperset={inSuperset}
        pillShown={pills.isShown(we.id)}
        onClick={() => {
          if (!inSuperset) return pills.toggle(we.id);
          const before = workout.exercises.map((x) => ({ id: x.id, supersetNext: x.supersetNext }));
          // Back to where it was before it was pulled in, if we know (it slides there).
          const origin = origins.current.get(we.id);
          origins.current.delete(we.id);
          flip();
          update((w) => {
            const out = leaveSuperset(w.exercises, w.exercises.findIndex((x) => x.id === we.id));
            return { ...w, exercises: origin === undefined ? out : placeAfter(out, out.findIndex((x) => x.id === we.id), origin) };
          });
          notify('Superset removed', {
            undo: () => {
              flip();
              update((w) => ({ ...w, exercises: restoreLinks(w.exercises, before) }));
            },
          });
        }}
      />
    );
  };

  const slotCard = (we: Workout['exercises'][number], i: number) => {
    const ex = exerciseById.get(we.exerciseId);
    return (
      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="spread holdable" style={{ flexWrap: 'nowrap' }} {...reorder.handle(i)}>
          {/* A long name wraps onto more lines; the buttons stay on the right. */}
          <div className="row" style={{ minWidth: 0, flex: 1, gap: 8, flexWrap: 'nowrap' }}>
            <span className="set-num" style={{ flexShrink: 0 }}>{i + 1}</span>
            {ex && hasMedia(mediaFor(ex)) && (
              <button className="thumb-btn" onClick={() => setPhotosOf(ex)} aria-label={`Photos of ${ex.name}`} title="How it's done">
                <ExerciseThumb media={mediaFor(ex)} size={36} />
              </button>
            )}
            <span style={{ fontWeight: 600, fontSize: 15, minWidth: 0, overflowWrap: 'anywhere' }}>{ex?.name ?? 'Unknown'}</span>
            {ex && (
              <button className="icon-btn" style={{ width: 26, height: 26, flexShrink: 0 }} onClick={() => setRenaming(ex)} aria-label={`Rename ${ex.name}`} title="Rename">
                <Pencil size={13} />
              </button>
            )}
          </div>
          <div className="row" style={{ gap: 0, flexShrink: 0, flexWrap: 'nowrap' }}>
            <button
              className="icon-btn"
              disabled={i === 0}
              onClick={() => update((w) => ({ ...w, exercises: moveUnlinked(w.exercises, i, i - 1) }))}
              aria-label="Move up"
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-btn"
              disabled={i === workout.exercises.length - 1}
              onClick={() => update((w) => ({ ...w, exercises: moveUnlinked(w.exercises, i, i + 1) }))}
              aria-label="Move down"
            >
              <ArrowDown size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => update((w) => ({ ...w, exercises: removeUnlinked(w.exercises, i) }))}
              aria-label="Remove exercise"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <span className="label">Sets</span>
            <Stepper label="sets" value={we.targetSets} onChange={(targetSets) => setSlot(we.id, { targetSets })} />
          </div>
          <label style={{ width: 100 }}>
            <span className="label">Reps</span>
            <input className="input tnum" placeholder={DEFAULT_REPS} value={we.targetReps} onChange={(e) => setSlot(we.id, { targetReps: e.target.value })} />
          </label>
          <label style={{ flex: '1 1 140px', minWidth: 0 }}>
            <span className="label">Notes</span>
            <input className="input" placeholder="Optional" value={we.notes ?? ''} onChange={(e) => setSlot(we.id, { notes: e.target.value })} />
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6, marginRight: -6, marginBottom: -4 }}>
          {supersetButton(we, i)}
        </div>
      </div>
    );
  };

  return (
    <div className="narrow">
      <Link to={from} className="back-link">
        <ArrowLeft size={15} /> {backLabel}
      </Link>

      <div className="row" style={{ alignItems: 'center' }}>
        <input
          ref={nameRef}
          className="title-input"
          value={workout.name}
          onChange={(e) => update((w) => ({ ...w, name: e.target.value }))}
          onBlur={settleName}
          aria-label="Workout name"
          aria-invalid={nameClash}
        />
        <NotesButton label="Workout notes" hasNotes={!!workout.notes?.trim()} open={notesOpen} onClick={() => setNotesOpen(!notesOpen)} />
        <button className="btn btn-primary btn-sm" onClick={done}>
          <Check size={15} /> Done
        </button>
      </div>
      {nameClash && (
        <p className="name-clash small">
          You already have a workout called “{workout.name.trim()}”. This one will be named “{uniqueName(workout.name, others, workout.id)}”.
        </p>
      )}
      {fromRoutine && sharedElsewhere.length > 0 && (
        <p className="muted small" style={{ marginTop: 6 }}>
          Also in {sharedElsewhere.map((r) => r.name).join(', ')}. Changes here apply there too.
        </p>
      )}
      {notesOpen && <WorkoutNotepad workout={workout} onChange={(notes) => update((w) => ({ ...w, notes }))} />}

      <section className="section" style={{ marginTop: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          {workout.exercises.length === 0 && <div className="empty">No exercises yet.</div>}
          {supersetGroups(workout.exercises).map((group) => (
            <div key={group[0].item.id} className={group.length > 1 ? 'superset' : 'stack'} style={group.length > 1 ? undefined : { gap: 10 }}>
              {group.length > 1 && <div className="superset-label">Superset · alternate sets, rest after the last one</div>}
              {group.map(({ item, index }, k) => (
                // The card and the pill under it move together when reordering.
                <div key={item.id} ref={reorder.itemRef(index)} className="slot" data-slot-id={item.id}>
                  {slotCard(item, index)}
                  {k === group.length - 1 && pills.isShown(item.id) && <SupersetPill host={index} onClick={() => setSupersetFor(item.id)} />}
                </div>
              ))}
            </div>
          ))}
          <div>
            <button className="btn btn-sm" onClick={() => setPicking(true)}>
              <Plus size={15} /> Add exercise
            </button>
          </div>
        </div>
      </section>

      {routines && routines.length > 0 && (
        <section className="section">
          <h2 className="section-title">Routines</h2>
          <div className="row-wrap">
            {routines.map((r) => (
              <button key={r.id} className={`chip${r.workoutIds.includes(workout.id) ? ' selected' : ''}`} onClick={() => toggleRoutine(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="row-wrap section" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-danger btn-sm" onClick={remove}>
          <Trash2 size={14} /> Delete workout
        </button>
        <div className="row-wrap" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shareLink(workout.name, { v: 1, workouts: [shareableWorkout(workout, exerciseById)] })}>
            <Share size={14} /> Share
          </button>
          <button className="btn btn-ghost btn-sm" onClick={duplicate}>
            <Copy size={14} /> {fromRoutine && sharedElsewhere.length > 0 ? `Separate copy for ${fromRoutine.name}` : 'Duplicate'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={start} disabled={workout.exercises.length === 0}>
            <Play size={14} /> Start now
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          selectedIds={workout.exercises.map((x) => x.exerciseId)}
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            update((w) => ({
              ...w,
              exercises: [...w.exercises, { id: newId(), exerciseId: ex.id, targetSets: DEFAULT_SETS, targetReps: DEFAULT_REPS }],
            }));
            setPicking(false);
          }}
        />
      )}
      {supersetFor && workout.exercises.some((x) => x.id === supersetFor) && (() => {
        const host = workout.exercises.findIndex((x) => x.id === supersetFor);
        const [start, end] = groupBounds(workout.exercises, host);
        const inGroup = workout.exercises.slice(start, end + 1).map((x) => x.exerciseId);
        return (
          <ExercisePicker
            title={`Superset ${exerciseById.get(workout.exercises[host].exerciseId)?.name ?? 'exercise'} with…`}
            featuredIds={workout.exercises.map((x) => x.exerciseId).filter((id) => !inGroup.includes(id))}
            excludeIds={inGroup}
            onClose={() => setSupersetFor(null)}
            onPick={(ex) => {
              // An exercise already in the workout moves up next to this one: remember where it was.
              const existing = workout.exercises.findIndex((x, i) => x.exerciseId === ex.id && (i < start || i > end));
              if (existing >= 0) rememberOrigin(workout.exercises, existing);
              flip();
              update((w) => {
                const at = w.exercises.findIndex((x) => x.id === supersetFor);
                const slot = () => ({ id: newId(), exerciseId: ex.id, targetSets: DEFAULT_SETS, targetReps: DEFAULT_REPS });
                return { ...w, exercises: supersetWith(w.exercises, at, ex.id, slot) };
              });
              setSupersetFor(null);
            }}
          />
        );
      })()}
      {renaming && <ExerciseForm exercise={renaming} onClose={() => setRenaming(null)} />}
      {photosOf && <ExercisePhotos name={photosOf.name} media={mediaFor(photosOf)} onClose={() => setPhotosOf(null)} />}
    </div>
  );
}
