import { useEffect, useState } from 'react';
import { now } from '../core/ids';
import { findEquivalent, findSimilar } from '../core/similarity';
import type { Exercise } from '../core/types';
import { repo } from '../data';
import { linkToCatalog, loadCatalog, similarInCatalog, type CatalogExercise } from '../data/catalog';
import { useExercises } from '../hooks/useRepo';
import { useFeedback } from './Feedback';
import { Modal } from './Modal';
import { LinksEditor } from './Notes';
import { SimilarExercises, type SimilarOption } from './SimilarExercises';

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Other'];

/** Create or edit (rename, regroup, link to the library, remove) an exercise. */
export function ExerciseForm({ exercise, isNew = false, onClose }: { exercise: Exercise; isNew?: boolean; onClose: () => void }) {
  const exercises = useExercises();
  const { notify } = useFeedback();
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [draft, setDraft] = useState(exercise);
  const [similar, setSimilar] = useState<SimilarOption[] | null>(null);

  useEffect(() => {
    void loadCatalog().then(setCatalog);
  }, []);

  const others = (exercises ?? []).filter((e) => !e.archived && e.id !== exercise.id);

  // Your own (unlinked) exercise that matches something in the library.
  const libraryMatches = !isNew && !exercise.catalogId ? findEquivalent(exercise.name, catalog) : [];

  const save = async (force = false) => {
    const name = draft.name.trim();
    if (!name) return;
    if (isNew && !force) {
      const options: SimilarOption[] = [
        ...findSimilar(name, others, 2).map((e) => ({ key: e.id, name: e.name, detail: e.muscleGroup ?? 'Other', source: 'yours' as const })),
        ...similarInCatalog(name, catalog, others).map((c) => ({ key: c.id, name: c.name, detail: c.muscleGroup, source: 'library' as const })),
      ].slice(0, 4);
      if (options.length) return setSimilar(options);
    }
    await repo.saveExercise({ ...draft, name, updatedAt: now() });
    onClose();
  };

  const chooseSimilar = async (option: SimilarOption) => {
    if (option.source === 'library') {
      const entry = catalog.find((c) => c.id === option.key);
      if (entry) await linkToCatalog({ ...draft, name: draft.name.trim() }, entry, exercises ?? []);
    }
    // Choosing one of your own just means not creating a duplicate.
    onClose();
  };

  const link = async (entry: CatalogExercise) => {
    await linkToCatalog(exercise, entry, exercises ?? []);
    onClose();
  };

  // Removes at once (past sessions and charts keep it) and offers Undo.
  const archive = async () => {
    await repo.saveExercise({ ...exercise, archived: true, updatedAt: now() });
    onClose();
    notify(`Removed “${exercise.name}”`, { undo: () => void repo.saveExercise({ ...exercise, archived: false, updatedAt: now() }) });
  };

  return (
    <Modal title={isNew ? 'New exercise' : 'Edit exercise'} onClose={onClose}>
      <div className="stack">
        {libraryMatches.length > 0 && (
          <div className="well">
            <div style={{ fontWeight: 600, fontSize: 14 }}>This looks like a library exercise</div>
            <div className="muted small" style={{ marginTop: 2 }}>
              Switching renames it and fills in its details. Your logged history stays.
            </div>
            <div style={{ margin: '6px -8px 0' }}>
              {libraryMatches.map((c) => (
                <button key={c.id} className="list-row" onClick={() => link(c)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div className="muted small">{c.muscleGroup}</div>
                  </div>
                  <span className="small muted">Switch to this</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label>
          <span className="label">Name</span>
          <input
            autoFocus
            className="input"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              setSimilar(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>

        {similar && (
          <SimilarExercises
            name={draft.name.trim()}
            options={similar}
            onChoose={chooseSimilar}
            onKeepMine={() => void save(true)}
            keepLabel="Save mine anyway"
          />
        )}

        <label>
          <span className="label">Muscle group</span>
          <select className="select" value={draft.muscleGroup ?? 'Other'} onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value })}>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="label">Type</span>
          <div className="segmented">
            <button className={draft.kind === 'weighted' ? 'on' : ''} onClick={() => setDraft({ ...draft, kind: 'weighted' })}>
              Weighted
            </button>
            <button className={draft.kind === 'bodyweight' ? 'on' : ''} onClick={() => setDraft({ ...draft, kind: 'bodyweight' })}>
              Bodyweight
            </button>
          </div>
        </div>
        <label>
          <span className="label">Notes</span>
          <textarea
            className="input"
            style={{ height: 'auto', minHeight: 72, padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
            value={draft.notes ?? ''}
            placeholder="Cues, seat height, anything to remember. Shows whenever you log it."
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <div>
          <span className="label">Links</span>
          <div className="notepad" style={{ marginTop: 0 }}>
            <LinksEditor links={draft.links ?? []} onChange={(links) => setDraft({ ...draft, links })} />
          </div>
        </div>
        <div className="spread" style={{ marginTop: 6 }}>
          {!isNew ? (
            <button className="btn btn-danger btn-sm" onClick={archive}>
              Remove
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" onClick={() => save()} disabled={!draft.name.trim()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
