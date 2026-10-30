import { ArrowLeft, ChartLine, Merge, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExerciseForm, MUSCLE_GROUPS } from '../components/ExerciseForm';
import { useFeedback } from '../components/Feedback';
import { duplicateGroups } from '../core/exerciseMerge';
import { newId, now } from '../core/ids';
import { findEquivalent } from '../core/similarity';
import { PLAN_PATH } from '../config';
import type { Exercise } from '../core/types';
import { loadCatalog, type CatalogExercise } from '../data/catalog';
import { mergeExercises } from '../data/merge';
import { useExercises, useSessions } from '../hooks/useRepo';

export function ExercisesPage() {
  const exercises = useExercises();
  const sessions = useSessions();
  const { notify } = useFeedback();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ exercise: Exercise; isNew: boolean } | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);

  useEffect(() => {
    void loadCatalog().then(setCatalog);
  }, []);

  // Your own exercises that look like a library exercise, flagged so you can link them.
  const hasLibraryMatch = useMemo(() => {
    const ids = new Set<string>();
    if (catalog.length === 0) return ids;
    for (const e of exercises ?? []) {
      if (!e.archived && !e.catalogId && findEquivalent(e.name, catalog).length) ids.add(e.id);
    }
    return ids;
  }, [exercises, catalog]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, Exercise[]>();
    for (const e of exercises ?? []) {
      if (e.archived || (q && !e.name.toLowerCase().includes(q))) continue;
      const g = e.muscleGroup || 'Other';
      map.set(g, [...(map.get(g) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => MUSCLE_GROUPS.indexOf(a) - MUSCLE_GROUPS.indexOf(b));
  }, [exercises, query]);

  // The same name more than once (imported twice, or copied in from another device): offered for merging.
  const duplicates = useMemo(() => duplicateGroups(exercises ?? [], sessions ?? []), [exercises, sessions]);

  const merge = async (groups: typeof duplicates) => {
    const undos: (() => Promise<void>)[] = [];
    for (const [keep, ...others] of groups) undos.push(await mergeExercises(keep, others));
    notify(groups.length === 1 ? `Merged “${groups[0][0].name}”` : `Merged ${groups.length} exercises`, {
      undo: async () => {
        for (const undo of undos.reverse()) await undo();
      },
    });
  };

  const startNew = () => {
    const ts = now();
    setEditing({ exercise: { id: newId(), name: '', kind: 'weighted', muscleGroup: 'Other', createdAt: ts, updatedAt: ts }, isNew: true });
  };

  return (
    <>
      <Link to={PLAN_PATH} className="back-link">
        <ArrowLeft size={15} /> Workouts
      </Link>
      <div className="spread">
        <h1 className="title">Exercises</h1>
        <button className="btn btn-sm" onClick={startNew}>
          <Plus size={15} /> New exercise
        </button>
      </div>

      <div className="search" style={{ maxWidth: 360, marginTop: 18 }}>
        <Search size={16} />
        <input className="input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {duplicates.length > 0 && (
        <div className="well" style={{ marginTop: 18, maxWidth: 680 }}>
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Listed more than once</div>
              <div className="muted small">Merging keeps one of each, with all their history, notes and links.</div>
            </div>
            {duplicates.length > 1 && (
              <button className="btn btn-sm" onClick={() => void merge(duplicates)}>
                <Merge size={14} /> Merge all
              </button>
            )}
          </div>
          <div style={{ margin: '6px -8px 0' }}>
            {duplicates.map((group) => (
              <div key={group[0].id} className="list-row" style={{ cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{group[0].name}</div>
                  <div className="muted small">{group.length} times</div>
                </div>
                <button className="btn btn-sm" onClick={() => void merge([group])}>
                  Merge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {grouped.map(([group, list]) => (
        <section key={group} className="section" style={{ marginTop: 26 }}>
          <h2 className="section-title">{group}</h2>
          <div className="grid-sm">
            {list.map((e) => (
              <div key={e.id} className="card" style={{ padding: '12px 14px' }}>
                <div className="spread" style={{ flexWrap: 'nowrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                    <div className="muted small">{e.kind === 'bodyweight' ? 'Bodyweight' : 'Weighted'}</div>
                    {hasLibraryMatch.has(e.id) && (
                      <button className="badge" style={{ border: 0, cursor: 'pointer', marginTop: 6 }} onClick={() => setEditing({ exercise: e, isNew: false })}>
                        Library match
                      </button>
                    )}
                  </div>
                  <div className="row" style={{ gap: 0, marginRight: -6 }}>
                    <Link to={`/analytics?exercise=${e.id}`} className="icon-btn" aria-label={`Analytics for ${e.name}`}>
                      <ChartLine size={15} />
                    </Link>
                    <button className="icon-btn" onClick={() => setEditing({ exercise: e, isNew: false })} aria-label={`Edit ${e.name}`}>
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && <ExerciseForm exercise={editing.exercise} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </>
  );
}
