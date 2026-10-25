import { ChevronRight } from 'lucide-react';
import { formatDate } from '../core/format';
import { exerciseRecords } from '../core/stats';
import type { Exercise, Session, WeightUnit } from '../core/types';
import { formatWeight } from '../core/units';

const NEW_FOR_MS = 7 * 86_400_000;

/**
 * Analytics → Records: each exercise's personal bests, most recently set first. Tapping one opens its chart.
 * Weighted exercises show the heaviest set and best estimated 1RM; bodyweight ones the most reps in a set.
 */
export function RecordsList({ exercises, sessions, unit, onOpen }: { exercises: Exercise[]; sessions: Session[]; unit: WeightUnit; onOpen: (id: string) => void }) {
  const rows = exercises
    .map((exercise) => ({ exercise, records: exerciseRecords(exercise.id, sessions) }))
    .filter((r): r is { exercise: Exercise; records: NonNullable<typeof r.records> } => r.records != null)
    .sort((a, b) => b.records.latest.localeCompare(a.records.latest));

  if (rows.length === 0) return <div className="empty">Records show up here once you've logged some sets.</div>;
  const w = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;

  return (
    <div className="records">
      {rows.map(({ exercise, records }) => {
        const weighted = exercise.kind !== 'bodyweight' && records.heaviest;
        const isNew = Date.now() - Date.parse(records.latest) < NEW_FOR_MS;
        return (
          <button key={exercise.id} className="list-row record-row" onClick={() => onOpen(exercise.id)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="record-name">
                {exercise.name}
                {isNew && <span className="badge">New</span>}
              </span>
              <span className="record-stats tnum">
                {weighted && records.heaviest && (
                  <span>
                    Heaviest <strong>{w(records.heaviest.weightKg)}</strong> × {records.heaviest.reps}
                  </span>
                )}
                {weighted && records.best && (
                  <span>
                    Best est. 1RM <strong>{w(records.best.e1rmKg)}</strong>
                  </span>
                )}
                {!weighted && records.mostReps && (
                  <span>
                    Most reps <strong>{records.mostReps.reps}</strong>
                    {records.mostReps.weightKg > 0 && ` (+${w(records.mostReps.weightKg)})`}
                  </span>
                )}
                <span className="muted">{formatDate(records.latest, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </span>
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        );
      })}
    </div>
  );
}
