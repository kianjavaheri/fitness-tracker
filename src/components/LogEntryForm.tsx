import { Disc3, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toLocalInput } from '../core/format';
import { isBarbellExercise } from '../core/plates';
import { emptySet } from '../core/sessions';
import type { Exercise, ID, SetLog, WeightUnit } from '../core/types';
import { removeLoggedNumbers, saveLoggedNumbers } from '../data/logEntry';
import { useFeedback } from './Feedback';
import { Modal } from './Modal';
import { NumericInput } from './NumericInput';
import { WeightInput } from './WeightInput';

/**
 * Typing in an exercise's numbers from the Log: a row per set, each with its own reps and weight, laid out like the live
 * workout. A row left empty copies the one above (shown as placeholders), so identical sets are typed once. Every set
 * needs reps and weight (no partial entries; weight is optional only for bodyweight exercises), and the date is
 * optional. Barbell lifts can be typed per side. Also changes numbers saved without a date.
 */
export function LogEntryForm({
  exercise,
  workout,
  occurrence,
  targetSets,
  unit,
  existing,
  onClose,
}: {
  exercise: Exercise;
  workout: { id: ID; name: string };
  occurrence: number;
  /** How many rows to start with: what the workout plans. */
  targetSets: number;
  unit: WeightUnit;
  /** Numbers typed in or noted down earlier, being changed. */
  existing?: { sessionId: ID; sets: SetLog[]; perSide: boolean; date: string | null };
  onClose: () => void;
}) {
  const { notify } = useFeedback();
  const [rows, setRows] = useState<SetLog[]>(() => existing?.sets ?? Array.from({ length: Math.max(1, targetSets) }, emptySet));
  const [perSide, setPerSide] = useState(existing?.perSide ?? false);
  const [date, setDate] = useState(() => (existing?.date ? toLocalInput(existing.date).split('T')[0] : ''));
  const [busy, setBusy] = useState(false);
  const bodyweight = exercise.kind === 'bodyweight';
  const barbell = isBarbellExercise(exercise);
  const today = toLocalInput(new Date().toISOString()).split('T')[0];

  // What each row comes to: its own numbers, else the row above's.
  const resolved: { reps: number | null; weightKg: number | null }[] = [];
  rows.forEach((row, i) => resolved.push({ reps: row.reps ?? resolved[i - 1]?.reps ?? null, weightKg: row.weightKg ?? resolved[i - 1]?.weightKg ?? null }));
  const complete = resolved.every((r) => !!r.reps && (bodyweight || !!r.weightKg)) && date <= today;

  const setRow = (id: ID, patch: Partial<SetLog>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!complete || busy) return;
    setBusy(true);
    const undo = await saveLoggedNumbers({
      exerciseId: exercise.id,
      workout,
      occurrence,
      numbers: { sets: resolved.map((r) => ({ reps: r.reps!, weightKg: r.weightKg })), perSide: barbell && perSide, date: date || null },
      replacing: existing?.sessionId,
    });
    onClose();
    notify(`Saved ${exercise.name}`, { undo: () => void undo() });
  };

  const remove = async () => {
    if (!existing || busy) return;
    setBusy(true);
    const undo = await removeLoggedNumbers(existing.sessionId, exercise.id, occurrence);
    onClose();
    notify(`Removed ${exercise.name}`, { undo: () => void undo() });
  };

  return (
    <Modal title={exercise.name} onClose={onClose}>
      <div className="stack">
        {barbell && (
          <div>
            <button className={`chip rest-chip${perSide ? ' own' : ''}`} onClick={() => setPerSide(!perSide)} aria-pressed={perSide} title="Enter the weight on one side of the bar; the total works itself out">
              <Disc3 size={13} /> Per side
            </button>
          </div>
        )}
        <div>
          <div className="set-grid log-entry-sets">
            <span className="head">Set</span>
            <span className="head" style={{ textAlign: 'center' }}>
              Reps
            </span>
            <span className="head" style={{ textAlign: 'center' }}>
              {bodyweight ? '+ Weight' : perSide && barbell ? 'Per side' : 'Weight'}
            </span>
            <span />
            {rows.map((row, i) => (
              <div key={row.id} style={{ display: 'contents' }}>
                <span className="set-num">{i + 1}</span>
                <NumericInput
                  className="set-input"
                  ariaLabel={`Set ${i + 1} reps`}
                  value={row.reps}
                  placeholder={resolved[i - 1]?.reps != null ? String(resolved[i - 1].reps) : '0'}
                  format={(v) => (v == null ? '' : String(v))}
                  parse={(t) => (t ? parseInt(t, 10) : null)}
                  onChange={(reps) => setRow(row.id, { reps })}
                />
                <WeightInput
                  className="set-input"
                  ariaLabel={`Set ${i + 1} weight`}
                  value={row.weightKg}
                  hintKg={resolved[i - 1]?.weightKg}
                  emptyPlaceholder={bodyweight ? 'BW' : '0'}
                  unit={unit}
                  perSide={barbell && perSide}
                  onChange={(weightKg) => setRow(row.id, { weightKg })}
                />
                <button className="icon-btn" disabled={rows.length === 1} onClick={() => setRows((list) => list.filter((r) => r.id !== row.id))} aria-label={`Remove set ${i + 1}`}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, marginLeft: -6 }} onClick={() => setRows((list) => [...list, emptySet()])}>
            <Plus size={14} /> Add set
          </button>
        </div>
        <div>
          <label>
            <span className="label">Date (optional)</span>
            {/* iOS draws today's date in an empty field, which looks chosen; so empty, it says so instead. */}
            <span className={`log-entry-date${date ? '' : ' no-value'}`}>
              <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              {!date && <span className="log-entry-no-date">No date</span>}
            </span>
          </label>
          {date && (
            <button className="link-btn small" style={{ marginTop: 6 }} onClick={() => setDate('')}>
              Clear date
            </button>
          )}
        </div>
        <div className="spread">
          {existing ? (
            <button className="btn btn-danger btn-sm" onClick={() => void remove()} disabled={busy}>
              Remove
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" onClick={() => void save()} disabled={!complete || busy}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
