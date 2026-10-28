import { History } from 'lucide-react';
import { groupSets, type PastSets, type PastWorkout } from '../core/stats';
import type { Exercise, SetLog, WeightUnit } from '../core/types';
import { formatWeight } from '../core/units';
import { Modal } from './Modal';

/** "Wed, Oct 22, 2026" */
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** The "Previous" button, beside the notes button on an exercise and on the workout. */
export function PreviousButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="prev-btn" onClick={onClick} aria-label={label} title={label}>
      <History size={14} strokeWidth={2.4} /> Previous
    </button>
  );
}

/** A day's sets as chips: "2 × 8 · 145 lb", "1 × 7 · 145 lb"; bodyweight shows "BW" or the added weight. */
function SetChips({ sets, unit, bodyweight }: { sets: SetLog[]; unit: WeightUnit; bodyweight: boolean }) {
  return (
    <div className="past-sets">
      {groupSets(sets).map((g, i) => {
        const weight = g.weightKg ? `${bodyweight ? '+' : ''}${formatWeight(g.weightKg, unit)} ${unit}` : bodyweight ? 'BW' : null;
        return (
          <span key={i} className="past-chip">
            {g.count} × {g.reps}
            {weight && <span className="muted"> · {weight}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** Every earlier time an exercise was done: date, then its sets. */
export function ExercisePrevious({ exercise, log, unit, onClose }: { exercise: Exercise; log: PastSets[]; unit: WeightUnit; onClose: () => void }) {
  return (
    <Modal title={exercise.name} onClose={onClose}>
      {log.length === 0 ? (
        <p className="muted">Nothing logged before this one yet.</p>
      ) : (
        <div className="past-list">
          {log.map((p) => (
            <div key={p.sessionId} className="past-day">
              <div className="past-date">{day(p.date)}</div>
              <SetChips sets={p.sets} unit={unit} bodyweight={exercise.kind === 'bodyweight'} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** This workout's exercises in earlier sessions of any workout: date and that session's name, then each one's sets. */
export function WorkoutPrevious({
  name,
  log,
  exerciseById,
  unit,
  onClose,
}: {
  name: string;
  log: PastWorkout[];
  exerciseById: Map<string, Exercise>;
  unit: WeightUnit;
  onClose: () => void;
}) {
  return (
    <Modal title={name} onClose={onClose}>
      {log.length === 0 ? (
        <p className="muted">None of these exercises have been logged before.</p>
      ) : (
        <div className="past-list">
          {log.map((p) => (
            <div key={p.sessionId} className="past-day">
              <div className="past-date">
                {day(p.date)} <span className="muted past-session">· {p.name}</span>
              </div>
              {p.exercises.map((e, i) => {
                const exercise = exerciseById.get(e.exerciseId);
                return (
                  <div key={`${e.exerciseId}-${i}`} className="past-exercise">
                    <div className="past-name">{exercise?.name ?? 'Unknown exercise'}</div>
                    <SetChips sets={e.sets} unit={unit} bodyweight={exercise?.kind === 'bodyweight'} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
