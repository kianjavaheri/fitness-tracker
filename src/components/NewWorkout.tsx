import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { ID } from '../core/types';
import { saveNewWorkout } from '../data/newWorkout';
import { ExerciseGrid, type GridItem } from './ExerciseGrid';

/** A workout's name, the exercises picked so far (numbered, tap to drop), and the grid to pick them from. */
export function WorkoutFields({
  name,
  onName,
  placeholder,
  picked,
  onToggle,
}: {
  name: string;
  onName: (name: string) => void;
  placeholder: string;
  picked: GridItem[];
  onToggle: (item: GridItem) => void;
}) {
  return (
    <>
      <label style={{ display: 'block' }}>
        <span className="label">Workout name</span>
        <input className="input" placeholder={placeholder} value={name} onChange={(e) => onName(e.target.value)} />
      </label>
      {picked.length > 0 && (
        <div className="intro-picked">
          {picked.map((p, i) => (
            <button key={p.key} className="chip" onClick={() => onToggle(p)} title="Remove">
              {i + 1}. {p.name} <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <ExerciseGrid picked={picked} onToggle={onToggle} />
      </div>
    </>
  );
}

/** Adds the item if it isn't picked, else drops it (picks keep the order they were tapped in). */
export const togglePicked = (list: GridItem[], item: GridItem) =>
  list.some((p) => p.key === item.key) ? list.filter((p) => p.key !== item.key) : [...list, item];

/**
 * Making a new workout: a window of its own (the intro's) to name it and tap its exercises in a grid, then on to the
 * workout editor for sets and reps. Opened from Workouts' "New workout" and a routine's (then it joins that routine).
 */
export function NewWorkoutWindow({ routine, from, onClose }: { routine?: { id: ID; name: string }; from?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<GridItem[]>([]);
  const [busy, setBusy] = useState(false);

  // A window of its own: the page behind doesn't scroll.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const save = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const workout = await saveNewWorkout(name, picked, routine?.id);
      onClose();
      navigate(`/edit/workouts/${workout.id}${from ? `?from=${encodeURIComponent(from)}` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  // In <body>, like dialogs: opened from a tab page, which is a layer of its own (for swiping), the window would be
  // drawn inside that page, under the tab bar.
  return createPortal(
    <div className="intro" role="dialog" aria-modal="true" aria-label="New workout" data-no-swipe>
      <div className="intro-panel">
        <div className="intro-top">
          <span />
          <button className="icon-btn" onClick={onClose} aria-label="Cancel">
            <X size={20} />
          </button>
        </div>
        <div className="intro-body">
          {routine && <div className="intro-kicker">{routine.name}</div>}
          <h1 className="title">New workout</h1>
          <p className="intro-lead">Name it, then tap the exercises it has. You can change sets and reps next.</p>
          <WorkoutFields name={name} onName={setName} placeholder="New workout" picked={picked} onToggle={(item) => setPicked((l) => togglePicked(l, item))} />
        </div>
        <div className="intro-foot">
          <span className="muted small">{picked.length === 1 ? '1 exercise' : `${picked.length} exercises`}</span>
          <button className="btn btn-primary" onClick={() => void save()} disabled={!picked.length || busy}>
            {busy ? 'Saving…' : 'Save workout'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
