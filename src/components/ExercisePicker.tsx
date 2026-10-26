import { Check, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { newId, now } from '../core/ids';
import type { Exercise, ExerciseKind, ID } from '../core/types';
import { repo } from '../data';
import { findSimilar } from '../core/similarity';
import { adoptCatalogExercise, loadCatalog, matchesQuery, similarInCatalog, type CatalogExercise } from '../data/catalog';
import { useExercises } from '../hooks/useRepo';
import { ExerciseForm } from './ExerciseForm';
import { Modal } from './Modal';
import { SimilarExercises, type SimilarOption } from './SimilarExercises';

const LIBRARY_LIMIT = 40;

interface Props {
  title?: string;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
  /** Exercises to mark as already added. */
  selectedIds?: ID[];
  /** Listed first, tagged "In this workout" (e.g. the workout's own exercises when picking one to superset with). */
  featuredIds?: ID[];
  /** Left out of the list (e.g. the exercise being supersetted). */
  excludeIds?: ID[];
}

/** On a phone the list is what you came for: the keyboard opens only when you tap the search field. */
const typingFirst = () => !matchMedia('(pointer: coarse)').matches;

/** Searches your exercises and the built-in library; can also create or rename exercises inline. */
export function ExercisePicker({ title = 'Add exercise', onPick, onClose, selectedIds = [], featuredIds = [], excludeIds = [] }: Props) {
  const exercises = useExercises();
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('weighted');
  const [editing, setEditing] = useState<Exercise | null>(null);
  // Set when a new name looks like an existing exercise; we ask before creating a duplicate.
  const [similar, setSimilar] = useState<SimilarOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then((c) => !cancelled && setCatalog(c));
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim();

  const mine = useMemo(() => {
    const matching = (exercises ?? [])
      .filter((e) => !e.archived && !excludeIds.includes(e.id))
      .filter((e) => !q || matchesQuery(`${e.name} ${e.muscleGroup ?? ''} ${e.equipment ?? ''}`, q));
    const featured = featuredIds.flatMap((id) => matching.filter((e) => e.id === id));
    return [...new Set([...featured, ...matching])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, q, featuredIds.join(), excludeIds.join()]);

  // Library matches, minus anything already in your list.
  const library = useMemo(() => {
    if (!q) return [];
    const owned = new Set((exercises ?? []).filter((e) => !e.archived).map((e) => e.catalogId ?? e.name.toLowerCase()));
    return catalog
      .filter((c) => !owned.has(c.id) && !owned.has(c.name.toLowerCase()))
      .filter((c) => matchesQuery(`${c.name} ${c.muscleGroup} ${c.equipment ?? ''}`, q));
  }, [catalog, exercises, q]);

  const exactMatch = [...mine, ...library].some((e) => e.name.toLowerCase() === q.toLowerCase());

  const create = async (force = false) => {
    if (!q) return;
    if (!force) {
      const own = (exercises ?? []).filter((e) => !e.archived);
      const options: SimilarOption[] = [
        ...findSimilar(q, own, 2).map((e) => ({ key: e.id, name: e.name, detail: describe(e.muscleGroup, e.kind, e.equipment), source: 'yours' as const })),
        ...similarInCatalog(q, catalog, own).map((c) => ({ key: c.id, name: c.name, detail: describe(c.muscleGroup, c.kind, c.equipment), source: 'library' as const })),
      ].slice(0, 4);
      if (options.length) return setSimilar(options);
    }
    const ts = now();
    const exercise: Exercise = { id: newId(), name: q, kind, createdAt: ts, updatedAt: ts };
    await repo.saveExercise(exercise);
    onPick(exercise);
  };

  const pickFromLibrary = async (entry: CatalogExercise) => onPick(await adoptCatalogExercise(entry, exercises ?? []));

  const chooseSimilar = (option: SimilarOption) => {
    if (option.source === 'yours') {
      const mine = exercises?.find((e) => e.id === option.key);
      if (mine) onPick(mine);
    } else {
      const entry = catalog.find((c) => c.id === option.key);
      if (entry) void pickFromLibrary(entry);
    }
  };

  // Swap the picker for the edit form while renaming, then come back to the list.
  if (editing) return <ExerciseForm exercise={editing} onClose={() => setEditing(null)} />;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="search" style={{ marginBottom: 10 }}>
        <Search size={16} />
        <input
          autoFocus={typingFirst()}
          className="input"
          placeholder={catalog.length ? `Search ${catalog.length}+ exercises or type a new one` : 'Search or type a new exercise'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSimilar(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (mine.length + library.length === 1) {
              if (mine[0]) onPick(mine[0]);
              else void pickFromLibrary(library[0]);
            } else if (!exactMatch) void create();
          }}
        />
      </div>

      {similar && (
        <div style={{ marginBottom: 10 }}>
          <SimilarExercises
            name={q}
            options={similar}
            onChoose={chooseSimilar}
            onKeepMine={() => void create(true)}
            keepLabel={`Add “${q}” anyway`}
          />
        </div>
      )}

      {q && !exactMatch && !similar && (
        <div className="well" style={{ marginBottom: 10 }}>
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Add “{q}” as a new exercise</div>
              <div className="segmented" style={{ marginTop: 8 }}>
                <button className={kind === 'weighted' ? 'on' : ''} onClick={() => setKind('weighted')}>
                  Weighted
                </button>
                <button className={kind === 'bodyweight' ? 'on' : ''} onClick={() => setKind('bodyweight')}>
                  Bodyweight
                </button>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => create()}>
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
      )}

      {q && mine.length > 0 && <div className="label" style={{ margin: '12px 12px 4px' }}>Your exercises</div>}
      {mine.map((e) => (
        <div key={e.id} className="row" style={{ gap: 2 }}>
          <button className="list-row" onClick={() => onPick(e)}>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</span>
                {featuredIds.includes(e.id) && <span className="badge">In this workout</span>}
              </div>
              <div className="muted small">{describe(e.muscleGroup, e.kind, e.equipment)}</div>
            </div>
            {selectedIds.includes(e.id) ? <Check size={16} className="muted" /> : <Plus size={16} className="muted" />}
          </button>
          <button className="icon-btn" onClick={() => setEditing(e)} aria-label={`Rename ${e.name}`} title="Rename">
            <Pencil size={14} />
          </button>
        </div>
      ))}

      {library.length > 0 && (
        <>
          <div className="label" style={{ margin: '14px 12px 4px' }}>
            Exercise library
          </div>
          {library.slice(0, LIBRARY_LIMIT).map((c) => (
            <button key={c.id} className="list-row" onClick={() => pickFromLibrary(c)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div className="muted small">{describe(c.muscleGroup, c.kind, c.equipment)}</div>
              </div>
              <Plus size={16} className="muted" />
            </button>
          ))}
          {library.length > LIBRARY_LIMIT && (
            <p className="muted small" style={{ padding: '8px 12px' }}>
              {library.length - LIBRARY_LIMIT} more — keep typing to narrow it down.
            </p>
          )}
        </>
      )}

      {!q && catalog.length > 0 && (
        <p className="muted small" style={{ padding: '12px 12px 0' }}>
          Type to search the built-in library of {catalog.length} exercises.
        </p>
      )}
    </Modal>
  );
}

function describe(group: string | undefined, kind: ExerciseKind, equipment?: string) {
  const detail = kind === 'bodyweight' ? 'Bodyweight' : equipment && equipment[0].toUpperCase() + equipment.slice(1);
  return [group ?? 'Other', detail].filter(Boolean).join(' · ');
}
