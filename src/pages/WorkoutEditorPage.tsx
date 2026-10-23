import { ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExerciseForm } from '../components/ExerciseForm';
import { ExercisePicker } from '../components/ExercisePicker';
import { NotFound } from '../components/NotFound';
import { NotesButton, WorkoutNotepad } from '../components/Notes';
import { Stepper } from '../components/Stepper';
import { DEFAULT_REPS, DEFAULT_SETS } from '../config';
import { newId, now } from '../core/ids';
import { createSessionFromWorkout } from '../core/sessions';
import type { Exercise, Workout } from '../core/types';
import { repo } from '../data';
import { useEditable } from '../hooks/useEditable';
import { useExercises, useRoutines } from '../hooks/useRepo';
import { move } from '../utils/array';

export function WorkoutEditorPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const exercises = useExercises();
  const routines = useRoutines();
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<Exercise | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Where to return on Save / back: the routine this was opened from, or the workouts list.
  const from = params.get('from')?.startsWith('/') ? params.get('from')! : '/edit';
  const backLabel = from.startsWith('/edit/routines/') ? 'Routine' : 'Edit workouts';

  const [workout, update] = useEditable<Workout>(
    () => repo.getWorkout(id),
    (w) => repo.saveWorkout({ ...w, updatedAt: now() }),
    [id],
  );

  const isNew = params.get('new') === '1';
  useEffect(() => {
    if (isNew && workout) nameRef.current?.select();
    // Only on first load of a freshly created workout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, workout?.id]);

  if (workout === undefined) return null;
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

  const save = () => {
    if (!workout.name.trim()) update((w) => ({ ...w, name: 'Untitled workout' }));
    navigate(from);
  };

  const start = async () => {
    const session = createSessionFromWorkout(workout, null);
    await repo.saveSession(session);
    navigate(`/session/${session.id}`);
  };

  const remove = async () => {
    if (!confirm(`Delete “${workout.name}”? Past sessions are kept.`)) return;
    await repo.deleteWorkout(workout.id);
    navigate(from, { replace: true });
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
          onBlur={() => !workout.name.trim() && update((w) => ({ ...w, name: 'Untitled workout' }))}
          aria-label="Workout name"
        />
        <NotesButton label="Workout notes" hasNotes={!!workout.notes?.trim()} open={notesOpen} onClick={() => setNotesOpen(!notesOpen)} />
        <button className="btn btn-primary btn-sm" onClick={save}>
          <Check size={15} /> Save
        </button>
      </div>
      {notesOpen && <WorkoutNotepad workout={workout} onChange={(notes) => update((w) => ({ ...w, notes }))} />}

      <section className="section" style={{ marginTop: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          {workout.exercises.length === 0 && <div className="empty">No exercises yet.</div>}
          {workout.exercises.map((we, i) => {
            const ex = exerciseById.get(we.exerciseId);
            return (
              <div key={we.id} className="card" style={{ padding: '12px 14px' }}>
                <div className="spread" style={{ flexWrap: 'nowrap' }}>
                  <div className="row" style={{ minWidth: 0, gap: 8 }}>
                    <span className="set-num">{i + 1}</span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{ex?.name ?? 'Unknown'}</span>
                    {ex && (
                      <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setRenaming(ex)} aria-label={`Rename ${ex.name}`} title="Rename">
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  <div className="row" style={{ gap: 0 }}>
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      onClick={() => update((w) => ({ ...w, exercises: move(w.exercises, i, i - 1) }))}
                      aria-label="Move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === workout.exercises.length - 1}
                      onClick={() => update((w) => ({ ...w, exercises: move(w.exercises, i, i + 1) }))}
                      aria-label="Move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => update((w) => ({ ...w, exercises: w.exercises.filter((x) => x.id !== we.id) }))}
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
              </div>
            );
          })}
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
        <button className="btn btn-ghost btn-sm" onClick={start} disabled={workout.exercises.length === 0}>
          <Play size={14} /> Start now
        </button>
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
      {renaming && <ExerciseForm exercise={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}
