import { Check, ClipboardPaste, Library, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NewWorkoutWindow } from '../components/NewWorkout';
import { PageSkeleton } from '../components/Skeleton';
import { RoutineActions, WorkoutActions, type Held } from '../components/WorkoutActions';
import { everyLabel, pluralize } from '../core/format';
import { newId, now } from '../core/ids';
import { uniqueName } from '../core/plan';
import { followedRoutine, routinesContaining, WEEKDAYS } from '../core/stats';
import type { Routine, Workout } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useLongPress } from '../hooks/useLongPress';
import { useExercises, useRoutines, useWorkouts } from '../hooks/useRepo';

/** Workouts: routines (and which one you follow), workout templates, exercises and import. */
export function WorkoutPlan() {
  const navigate = useNavigate();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const exercises = useExercises();
  const { settings, update: updateSettings } = useSettings();
  const followed = followedRoutine(routines ?? [], settings.activeRoutineId);
  const canPick = (routines?.length ?? 0) > 1;
  const exerciseName = new Map(exercises?.map((e) => [e.id, e.name]));
  const workoutName = new Map(workouts?.map((w) => [w.id, w.name]));
  const [held, setHeld] = useState<Held<Workout> | null>(null);
  const [heldRoutine, setHeldRoutine] = useState<Held<Routine> | null>(null);
  /** "New workout": the window to name it and pick its exercises. */
  const [creating, setCreating] = useState(false);
  const hold = useLongPress(setHeld);
  const holdRoutine = useLongPress(setHeldRoutine);


  const createRoutine = async () => {
    const ts = now();
    const r: Routine = { id: newId(), name: uniqueName('New routine', routines ?? []), workoutIds: [], createdAt: ts, updatedAt: ts };
    await repo.saveRoutine(r);
    navigate(`/edit/routines/${r.id}?new=1`);
  };

  const daysLabel = (r: Routine, workoutId: string) => {
    if (r.rotateEvery) return '';
    if (r.every?.[workoutId]) return ` · ${everyLabel(r.every[workoutId])}`;
    const days = r.days?.[workoutId] ?? [];
    return days.length ? ` · ${[...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ')}` : '';
  };

  if (!workouts || !routines) return <PageSkeleton title={false} />;

  return (
    <>
      <div className="row-wrap" style={{ gap: 6, marginTop: 20 }}>
        <Link to="/edit/import" className="btn btn-sm">
          <ClipboardPaste size={15} /> Import from notes
        </Link>
        <Link to="/edit/exercises" className="btn btn-ghost btn-sm">
          <Library size={15} /> Exercises
        </Link>
      </div>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Routines
          </h2>
          <button className="btn btn-sm" onClick={createRoutine}>
            <Plus size={15} /> New routine
          </button>
        </div>
        {routines?.length === 0 && <div className="empty">No routines yet. A routine groups workouts you rotate through.</div>}
        {(routines.length > 0 || workouts.length > 0) && (
          <p className="muted small" style={{ margin: '-4px 0 12px' }}>
            {canPick && "Tap the routine you're following; Home plans your week from it. The pencil edits a routine. "}
            Press and hold a routine or workout to rename or delete it.
          </p>
        )}
        <div className="grid">
          {routines?.map((r) => (
            <div key={r.id} className="routine-wrap">
              {/* Tapping a routine follows it (with only one, it's followed anyway); the pencil opens the editor. */}
              <div
                role="button"
                tabIndex={0}
                className={`card holdable routine-card${canPick && followed?.id === r.id ? ' followed' : ''}`}
                onClick={() => canPick && updateSettings({ activeRoutineId: r.id })}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && canPick && updateSettings({ activeRoutineId: r.id })}
                aria-pressed={canPick ? followed?.id === r.id : undefined}
                {...holdRoutine(r)}
              >
                <div className="card-title" style={{ paddingRight: canPick ? 72 : 36 }}>
                  {r.name}
                </div>
                {r.rotateEvery && r.workoutIds.length > 0 && <div className="muted small" style={{ marginTop: 2 }}>In rotation · {everyLabel(r.rotateEvery).toLowerCase()}</div>}
                <div className="stack" style={{ gap: 4, marginTop: 10 }}>
                  {r.workoutIds.length === 0 && <span className="muted small">No workouts yet</span>}
                  {r.workoutIds.map((id) => (
                    <span key={id} className="small">
                      {workoutName.get(id) ?? 'Unknown'}
                      <span className="muted">{daysLabel(r, id)}</span>
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`/edit/routines/${r.id}`} className={`icon-btn routine-edit${canPick ? '' : ' alone'}`} aria-label={`Edit ${r.name}`} title="Edit">
                <Pencil size={15} />
              </Link>
              {canPick && (
                <button
                  className={`routine-pick${followed?.id === r.id ? ' on' : ''}`}
                  onClick={() => updateSettings({ activeRoutineId: followed?.id === r.id ? null : r.id })}
                  aria-pressed={followed?.id === r.id}
                  aria-label={followed?.id === r.id ? `Following ${r.name}` : `Follow ${r.name}`}
                  title={followed?.id === r.id ? 'Following' : 'Follow this routine'}
                >
                  <Check size={14} strokeWidth={3} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Workouts
          </h2>
          <button className="btn btn-sm" onClick={() => setCreating(true)}>
            <Plus size={15} /> New workout
          </button>
        </div>
        {workouts?.length === 0 && <div className="empty">No workouts yet.</div>}
        <div className="grid">
          {workouts?.map((w) => {
            const inRoutines = routinesContaining(w.id, routines ?? []);
            return (
              <Link key={w.id} to={`/edit/workouts/${w.id}`} className="card holdable" {...hold(w)}>
                <div className="card-title">{w.name}</div>
                <div className="card-body clamp-4 small">
                  {w.exercises.length === 0 ? 'No exercises yet' : w.exercises.map((we) => exerciseName.get(we.exerciseId)).join(' · ')}
                </div>
                <div className="row-wrap" style={{ marginTop: 10 }}>
                  <span className="muted small">{pluralize(w.exercises.length, 'exercise')}</span>
                  {inRoutines.map((r) => (
                    <span key={r.id} className="badge">
                      {r.name}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      {heldRoutine && (
        <RoutineActions held={heldRoutine} routines={routines} workouts={workouts} exercises={exercises ?? []} onClose={() => setHeldRoutine(null)} />
      )}
      {held && <WorkoutActions held={held} workouts={workouts} routines={routines} exercises={exercises ?? []} onClose={() => setHeld(null)} />}
      {creating && <NewWorkoutWindow onClose={() => setCreating(false)} />}
    </>
  );
}
