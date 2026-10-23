import { Check, ClipboardPaste, Library, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { pluralize } from '../core/format';
import { newId, now } from '../core/ids';
import { followedRoutine, routinesContaining, WEEKDAYS } from '../core/stats';
import type { Routine, Workout } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useExercises, useRoutines, useWorkouts } from '../hooks/useRepo';

export function EditWorkoutsPage() {
  const navigate = useNavigate();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const exercises = useExercises();
  const { settings, update: updateSettings } = useSettings();
  const followed = followedRoutine(routines ?? [], settings.activeRoutineId);
  const canPick = (routines?.length ?? 0) > 1;
  const exerciseName = new Map(exercises?.map((e) => [e.id, e.name]));
  const workoutName = new Map(workouts?.map((w) => [w.id, w.name]));

  const createWorkout = async () => {
    const ts = now();
    const w: Workout = { id: newId(), name: 'New workout', exercises: [], createdAt: ts, updatedAt: ts };
    await repo.saveWorkout(w);
    navigate(`/edit/workouts/${w.id}?new=1`);
  };

  const createRoutine = async () => {
    const ts = now();
    const r: Routine = { id: newId(), name: 'New routine', workoutIds: [], createdAt: ts, updatedAt: ts };
    await repo.saveRoutine(r);
    navigate(`/edit/routines/${r.id}?new=1`);
  };

  const daysLabel = (r: Routine, workoutId: string) => {
    const days = r.days?.[workoutId] ?? [];
    return days.length ? ` · ${[...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join(', ')}` : '';
  };

  return (
    <>
      <div className="spread">
        <h1 className="title">Edit workouts</h1>
        <div className="row" style={{ gap: 6 }}>
          <Link to="/edit/import" className="btn btn-sm">
            <ClipboardPaste size={15} /> Import from notes
          </Link>
          <Link to="/edit/exercises" className="btn btn-ghost btn-sm">
            <Library size={15} /> Exercises
          </Link>
        </div>
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
        {canPick && (
          <p className="muted small" style={{ margin: '-4px 0 12px' }}>
            Tap the circle on the routine you're following. Home plans your week from it.
          </p>
        )}
        <div className="grid">
          {routines?.map((r) => (
            <div key={r.id} className="routine-wrap">
              <Link to={`/edit/routines/${r.id}`} className={`card${canPick && followed?.id === r.id ? ' followed' : ''}`}>
                <div className="card-title" style={canPick ? { paddingRight: 32 } : undefined}>
                  {r.name}
                </div>
                <div className="stack" style={{ gap: 4, marginTop: 10 }}>
                  {r.workoutIds.length === 0 && <span className="muted small">No workouts yet</span>}
                  {r.workoutIds.map((id) => (
                    <span key={id} className="small">
                      {workoutName.get(id) ?? 'Unknown'}
                      <span className="muted">{daysLabel(r, id)}</span>
                    </span>
                  ))}
                </div>
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
          <button className="btn btn-sm" onClick={createWorkout}>
            <Plus size={15} /> New workout
          </button>
        </div>
        {workouts?.length === 0 && <div className="empty">No workouts yet.</div>}
        <div className="grid">
          {workouts?.map((w) => {
            const inRoutines = routinesContaining(w.id, routines ?? []);
            return (
              <Link key={w.id} to={`/edit/workouts/${w.id}`} className="card">
                <div className="card-title">{w.name}</div>
                <div className="card-body small">
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
    </>
  );
}
