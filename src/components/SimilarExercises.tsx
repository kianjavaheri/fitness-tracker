import { ArrowRight } from 'lucide-react';

export interface SimilarOption {
  key: string;
  name: string;
  detail: string;
  /** "yours" for something already in your list, "library" for the built-in library. */
  source: 'yours' | 'library';
}

/** "Did you mean…?" list shown before adding an exercise that looks like an existing one. */
export function SimilarExercises({
  name,
  options,
  onChoose,
  onKeepMine,
  keepLabel,
}: {
  name: string;
  options: SimilarOption[];
  onChoose: (option: SimilarOption) => void;
  onKeepMine: () => void;
  keepLabel: string;
}) {
  return (
    <div className="well">
      <div style={{ fontWeight: 600, fontSize: 14 }}>“{name}” looks like an exercise that already exists</div>
      <div className="muted small" style={{ marginTop: 2 }}>
        Using the existing one keeps your history and charts in one place.
      </div>
      <div style={{ margin: '8px -8px 0' }}>
        {options.map((o) => (
          <button key={o.key} className="list-row" onClick={() => onChoose(o)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
              <div className="muted small">
                {o.source === 'yours' ? 'In your exercises' : 'From the library'} · {o.detail}
              </div>
            </div>
            <span className="small muted row" style={{ gap: 4 }}>
              Use this <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>
      <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={onKeepMine}>
        {keepLabel}
      </button>
    </div>
  );
}
