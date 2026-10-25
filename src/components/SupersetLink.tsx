import { Link2, Link2Off } from 'lucide-react';

/**
 * The small chip between two exercises in the workout editor: tap to make them a superset (alternate sets, rest after
 * the last one), tap again to split them.
 */
export function SupersetLink({ linked, onToggle }: { linked: boolean; onToggle: () => void }) {
  return (
    <div className="superset-link">
      <button className={`chip${linked ? ' linked' : ''}`} onClick={onToggle} aria-pressed={linked} title={linked ? 'Split this superset' : 'Make these two a superset'}>
        {linked ? <Link2Off size={13} /> : <Link2 size={13} />}
        {linked ? 'Unlink' : 'Superset'}
      </button>
    </div>
  );
}
