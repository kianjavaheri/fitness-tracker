import { pluralize } from '../core/format';
import type { Routine, Workout } from '../core/types';
import { repo } from '../data';
import { Modal } from './Modal';

interface DeleteRoutineDialogProps {
  routine: Routine;
  routines: Routine[];
  workouts: Workout[];
  onClose: () => void;
  /** After the delete went through (the routine editor leaves the page). */
  onDeleted?: () => void;
}

/** Asks before deleting a routine, offering to delete the workouts that no other routine uses along with it. */
export function DeleteRoutineDialog({ routine, routines, workouts, onClose, onDeleted }: DeleteRoutineDialogProps) {
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const otherRoutines = routines.filter((r) => r.id !== routine.id);
  // Workouts that would be left in no routine if this one went.
  const onlyHere = routine.workoutIds.filter((wid) => workoutById.has(wid) && !otherRoutines.some((r) => r.workoutIds.includes(wid)));

  const remove = async (withWorkouts: boolean) => {
    onClose();
    await repo.deleteRoutine(routine.id);
    // Past sessions are kept either way; workouts still used by another routine are never deleted.
    if (withWorkouts) for (const wid of onlyHere) await repo.deleteWorkout(wid);
    onDeleted?.();
  };

  const danger = { background: 'var(--danger)', color: 'var(--page-base)' };

  return (
    <Modal title={`Delete “${routine.name}”?`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        {onlyHere.length > 0
          ? `${pluralize(onlyHere.length, 'workout')} only used here: ${onlyHere.map((wid) => workoutById.get(wid)?.name).join(', ')}. ${onlyHere.length === 1 ? 'Keep it, or delete it' : 'Keep them, or delete them'} with the routine? Past sessions are kept either way.`
          : 'Its workouts are also in other routines, so they stay. Past sessions are kept.'}
      </p>
      <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
        <button className="btn btn-sm" autoFocus onClick={onClose}>
          Cancel
        </button>
        {onlyHere.length > 0 ? (
          <>
            <button className="btn btn-sm" onClick={() => remove(false)}>
              Delete routine only
            </button>
            <button className="btn btn-sm" style={danger} onClick={() => remove(true)}>
              Delete routine and workouts
            </button>
          </>
        ) : (
          <button className="btn btn-sm" style={danger} onClick={() => remove(false)}>
            Delete routine
          </button>
        )}
      </div>
    </Modal>
  );
}
