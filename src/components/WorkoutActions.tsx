import { PencilLine, Share, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { now } from '../core/ids';
import { uniqueName } from '../core/plan';
import { routinePayload, shareableWorkout } from '../core/share';
import type { Exercise, ID, Routine, Session, Workout } from '../core/types';
import { repo } from '../data';
import { removeFromAppleHealth, saveToAppleHealth, syncToAppleHealth } from '../native/health';
import { useShareLink } from '../hooks/useShareLink';
import { ContextMenu, type ContextAction } from './ContextMenu';
import { DeleteRoutineDialog } from './DeleteRoutineDialog';
import { useFeedback } from './Feedback';
import { Modal } from './Modal';

/** A card that was pressed and held: the record, and the card element the menu lifts out. */
export interface Held<T> {
  item: T;
  anchor: HTMLElement;
}

const ICON = { size: 22, strokeWidth: 1.8 };

interface RenameDialogProps {
  title: string;
  item: { id: ID; name: string };
  /** Records whose names this one can't take (it's renamed to the next free one instead). */
  others: { id: ID; name: string }[];
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}

function RenameDialog({ title, item, others, onRename, onClose }: RenameDialogProps) {
  const [name, setName] = useState(item.name);

  const rename = async () => {
    const next = uniqueName(name.trim() || item.name, others, item.id);
    if (next !== item.name) await onRename(next);
    onClose();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" aria-label="Name" />
        <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim() || name.trim() === item.name}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

const shareAction = (onSelect: () => void): ContextAction => ({ label: 'Share', icon: <Share {...ICON} />, onSelect });
const renameAction = (onSelect: () => void): ContextAction => ({ label: 'Rename', icon: <PencilLine {...ICON} />, onSelect });
const deleteAction = (onSelect: () => void): ContextAction => ({ label: 'Delete', icon: <Trash2 {...ICON} />, danger: true, onSelect });

interface WorkoutActionsProps {
  held: Held<Workout>;
  workouts: Workout[];
  routines: Routine[];
  exercises: Exercise[];
  onClose: () => void;
}

/** Share, rename or delete a workout from its card. Deleting acts at once and offers Undo. */
export function WorkoutActions({ held: { item: workout, anchor }, workouts, routines, exercises, onClose }: WorkoutActionsProps) {
  const { notify } = useFeedback();
  const shareLink = useShareLink();
  const [renaming, setRenaming] = useState(false);

  // Same as the editor's delete: Undo also puts it back in its routines, with their planned days.
  const remove = async () => {
    onClose();
    const inRoutines = routines.filter((r) => r.workoutIds.includes(workout.id));
    await repo.deleteWorkout(workout.id);
    notify(`Deleted “${workout.name}”`, {
      undo: async () => {
        await repo.saveWorkout(workout);
        for (const r of inRoutines) await repo.saveRoutine({ ...r, updatedAt: now() });
      },
    });
  };
  // Called straight from the tap, so iOS allows its share sheet.
  const share = () => {
    void shareLink(workout.name, { v: 1, workouts: [shareableWorkout(workout, new Map(exercises.map((e) => [e.id, e])))] });
    onClose();
  };

  if (renaming) {
    return (
      <RenameDialog
        title="Rename workout"
        item={workout}
        others={workouts}
        onRename={(name) => repo.saveWorkout({ ...workout, name, updatedAt: now() })}
        onClose={onClose}
      />
    );
  }
  const actions = [
    ...(workout.exercises.length > 0 ? [shareAction(share)] : []),
    renameAction(() => setRenaming(true)),
    deleteAction(() => void remove()),
  ];
  return <ContextMenu anchor={anchor} actions={actions} onClose={onClose} />;
}

interface RoutineActionsProps {
  held: Held<Routine>;
  routines: Routine[];
  workouts: Workout[];
  exercises: Exercise[];
  onClose: () => void;
}

/** Share, rename or delete a routine from its card. Deleting asks first, as in the routine editor. */
export function RoutineActions({ held: { item: routine, anchor }, routines, workouts, exercises, onClose }: RoutineActionsProps) {
  const shareLink = useShareLink();
  const [next, setNext] = useState<'rename' | 'delete' | null>(null);

  if (next === 'delete') return <DeleteRoutineDialog routine={routine} routines={routines} workouts={workouts} onClose={onClose} />;
  if (next === 'rename') {
    return (
      <RenameDialog
        title="Rename routine"
        item={routine}
        others={routines}
        onRename={(name) => repo.saveRoutine({ ...routine, name, updatedAt: now() })}
        onClose={onClose}
      />
    );
  }
  const share = () => {
    void shareLink(routine.name, routinePayload(routine, workouts, new Map(exercises.map((e) => [e.id, e]))));
    onClose();
  };
  const actions = [
    ...(routine.workoutIds.length > 0 ? [shareAction(share)] : []),
    renameAction(() => setNext('rename')),
    deleteAction(() => setNext('delete')),
  ];
  return <ContextMenu anchor={anchor} actions={actions} onClose={onClose} />;
}

/** Rename or delete a logged session from its History card. Deleting acts at once and offers Undo. */
export function SessionActions({ held: { item: session, anchor }, onClose }: { held: Held<Session>; onClose: () => void }) {
  const { notify } = useFeedback();
  const [renaming, setRenaming] = useState(false);

  const remove = async () => {
    onClose();
    await repo.deleteSession(session.id);
    removeFromAppleHealth(session.id);
    notify(`Deleted “${session.name}”`, {
      undo: () => {
        void repo.saveSession(session);
        saveToAppleHealth(session);
      },
    });
  };

  if (renaming) {
    // Sessions repeat names ("Push" every week), so any name goes.
    return <RenameDialog title="Rename workout" item={session} others={[]} onRename={(name) => {
          syncToAppleHealth({ ...session, name });
          return repo.saveSession({ ...session, name });
        }} onClose={onClose} />;
  }
  return <ContextMenu anchor={anchor} actions={[renameAction(() => setRenaming(true)), deleteAction(() => void remove())]} onClose={onClose} />;
}
