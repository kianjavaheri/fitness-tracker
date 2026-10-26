import { Link2 } from 'lucide-react';
import { useState } from 'react';

/**
 * The dashed "Superset" pill under an exercise (or under the last one of a superset), in the workout editor and while
 * logging. Tap it to search for an exercise to superset with; or hold another exercise and drop it here (it turns coral
 * while one hovers, via `data-superset-drop`, which useDragReorder looks for).
 */
export function SupersetPill({ host, onClick }: { host: number; onClick: () => void }) {
  return (
    <div className="superset-link">
      <button className="chip superset-pill" data-superset-drop={host} onClick={onClick} title="Superset with another exercise">
        <Link2 size={14} /> Superset
      </button>
    </div>
  );
}

/**
 * The link button at an exercise's bottom right. In a superset (coral) it takes the exercise out; otherwise it shows or
 * hides the Superset pill under it.
 */
export function SupersetButton({ inSuperset, pillShown, onClick }: { inSuperset: boolean; pillShown: boolean; onClick: () => void }) {
  const label = inSuperset ? 'Take out of the superset' : pillShown ? 'Hide the superset option' : 'Superset with another exercise';
  return (
    <button
      className={`icon-btn superset-btn${inSuperset ? ' on' : pillShown ? ' open' : ''}`}
      onClick={onClick}
      aria-pressed={inSuperset}
      aria-label={label}
      title={label}
    >
      <Link2 size={16} />
    </button>
  );
}

/**
 * Which exercises show their Superset pill, by the id of the exercise it sits under. The workout editor shows them
 * all at first, so the feature is easy to discover; while logging they're hidden until asked for.
 */
export function usePills(shownByDefault: boolean) {
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const isShown = (id: string) => flipped.has(id) !== shownByDefault;
  const set = (id: string, shown: boolean) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (shown === shownByDefault) next.delete(id);
      else next.add(id);
      return next;
    });
  return { isShown, toggle: (id: string) => set(id, !isShown(id)), show: (id: string) => set(id, true), hide: (id: string) => set(id, false) };
}
