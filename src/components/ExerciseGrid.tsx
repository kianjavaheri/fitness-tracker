import { Check, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { newId, now } from '../core/ids';
import type { Exercise } from '../core/types';
import { matchesQuery, POPULAR_IDS, type CatalogExercise } from '../data/catalog';
import { useCatalog, useExerciseMedia } from '../hooks/useCatalog';
import { useExercises } from '../hooks/useRepo';
import { haptic } from '../utils/haptics';
import { ExerciseForm } from './ExerciseForm';
import { ExerciseThumb } from './ExercisePhoto';

/** One tile: one of your exercises, a library one (added to yours when saved), or a new one by name. */
export interface GridItem {
  key: string;
  name: string;
  group: string;
  own?: Exercise;
  entry?: CatalogExercise;
}

const GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
/** Enough to browse; the search finds the rest. */
const LIMIT = 60;

/**
 * Exercises as a grid of tiles with pictures: tap one to pick it (its circle fills), tap again to drop it. Starts on
 * common lifts; filters by muscle group, or search the whole library. Picks keep the order they were tapped in.
 */
export function ExerciseGrid({ picked, onToggle }: { picked: GridItem[]; onToggle: (item: GridItem) => void }) {
  const exercises = useExercises();
  const catalog = useCatalog();
  const mediaFor = useExerciseMedia();
  const [filter, setFilter] = useState('Popular');
  const [query, setQuery] = useState('');
  const q = query.trim();
  /** An exercise of your own being made (the New exercise tile, or a search with no match); picked once saved. */
  const [creating, setCreating] = useState<Exercise | null>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // Searching: bring the search to the top of the scrolling window, so the results get the room down to the keyboard
  // (again once the keyboard is up, which moves things).
  const toTop = () => {
    const head = headRef.current;
    const scroller = head?.closest('.intro-body');
    if (!head || !scroller) return;
    const go = () => {
      const shift = head.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      if (Math.abs(shift) > 2) scroller.scrollTo({ top: scroller.scrollTop + shift, behavior: 'smooth' });
    };
    go();
    setTimeout(go, 350);
  };

  const { own, library, popularRank } = useMemo(() => {
    const own: GridItem[] = (exercises ?? [])
      .filter((e) => !e.archived)
      .map((e) => ({ key: `own:${e.id}`, name: e.name, group: e.muscleGroup || 'Other', own: e }));
    // Library entries you already have show as yours.
    const owned = new Set((exercises ?? []).filter((e) => !e.archived).flatMap((e) => [e.catalogId, e.name.toLowerCase()]));
    const library: GridItem[] = (catalog ?? [])
      .filter((c) => !owned.has(c.id) && !owned.has(c.name.toLowerCase()))
      .map((c) => ({ key: `lib:${c.id}`, name: c.name, group: c.muscleGroup, entry: c }));
    return { own, library, popularRank: new Map(POPULAR_IDS.map((id, i) => [id, i])) };
  }, [exercises, catalog]);

  const catalogIdOf = (item: GridItem) => item.entry?.id ?? item.own?.catalogId;
  const hasPicture = (item: GridItem) => !!mediaFor(item.own ?? { ...item.entry!, catalogId: item.entry!.id }).gif;

  const shown = useMemo(() => {
    const all = [...own, ...library];
    // Common lifts first, then ones with a picture, then A–Z.
    const rank = (item: GridItem) => popularRank.get(catalogIdOf(item) ?? '') ?? (hasPicture(item) ? 1000 : 2000);
    const sorted = (list: GridItem[]) => [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    if (q) {
      const matches = all.filter((i) => matchesQuery(`${i.name} ${i.group} ${i.entry?.equipment ?? i.own?.equipment ?? ''}`, q));
      // Names starting with what's typed come first.
      const starts = (i: GridItem) => (i.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1);
      return sorted(matches).sort((a, b) => starts(a) - starts(b)).slice(0, LIMIT);
    }
    if (filter === 'Popular') {
      const popular = all.filter((i) => popularRank.has(catalogIdOf(i) ?? ''));
      // One tile per lift: your own copy if you have it.
      const seen = new Set<string>();
      return sorted(popular).filter((i) => {
        const id = catalogIdOf(i)!;
        return !seen.has(id) && !!seen.add(id);
      });
    }
    if (filter === 'Yours') return sorted(own);
    return sorted(all.filter((i) => i.group === filter)).slice(0, LIMIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, library, filter, q, popularRank, catalog]);

  const pickedKeys = new Set(picked.map((p) => p.key));
  const exact = shown.some((i) => i.name.toLowerCase() === q.toLowerCase());
  const filters = ['Popular', ...(own.length ? ['Yours'] : []), ...GROUPS];

  const toggle = (item: GridItem, e: React.MouseEvent) => {
    haptic({ x: e.clientX, y: e.clientY }, 'light');
    onToggle(item);
  };

  // The same form as the Exercises page: name, muscle group, weighted or bodyweight (and a warning when the name
  // looks like one you have or one in the library).
  const startNew = (name: string) => {
    const ts = now();
    setCreating({ id: newId(), name, kind: 'weighted', muscleGroup: GROUPS.includes(filter) ? filter : 'Other', createdAt: ts, updatedAt: ts });
  };
  const pickCreated = (exercise: Exercise) => {
    const item: GridItem = { key: `own:${exercise.id}`, name: exercise.name, group: exercise.muscleGroup || 'Other', own: exercise };
    if (!pickedKeys.has(item.key)) onToggle(item);
    setQuery('');
  };

  return (
    <div className="ex-grid-wrap">
      <div className="ex-grid-head" ref={headRef}>
        <div className="search">
          <Search size={16} />
          <input
            className="input"
            placeholder="Search all exercises"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={toTop}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
        {!q && (
          <div className="chip-scroll" data-no-swipe>
            {filters.map((f) => (
              <button key={f} className={`chip${filter === f ? ' selected' : ''}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ex-grid">
        {/* Something that isn't in the library: make it here, without leaving the workout. */}
        <button className="ex-tile ex-tile-new" onClick={() => startNew(q)}>
          <span className="ex-tile-plus">
            <Plus size={26} />
          </span>
          <span className="ex-tile-name">New exercise</span>
        </button>
        {shown.map((item) => {
          const on = pickedKeys.has(item.key);
          return (
            <button key={item.key} className={`ex-tile${on ? ' on rb-outline' : ''}`} aria-pressed={on} onClick={(e) => toggle(item, e)}>
              <ExerciseThumb media={item.own ? mediaFor(item.own) : mediaFor({ ...item.entry!, catalogId: item.entry!.id })} size="fill" />
              <span className="ex-tile-name">{item.name}</span>
              <span className="ex-tile-check" aria-hidden>
                {on && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {q && !exact && (
          // Not in the library: make it your own, named what was typed.
          <button className="ex-tile ex-tile-new" onClick={() => startNew(q)}>
            <span className="ex-tile-plus">
              <Plus size={26} />
            </span>
            <span className="ex-tile-name">Add “{q}”</span>
          </button>
        )}
      </div>
      {creating && <ExerciseForm exercise={creating} isNew onClose={() => setCreating(null)} onSaved={pickCreated} />}
      {!q && filter !== 'Popular' && filter !== 'Yours' && shown.length === LIMIT && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Search to find more {filter.toLowerCase()} exercises.
        </p>
      )}
    </div>
  );
}
