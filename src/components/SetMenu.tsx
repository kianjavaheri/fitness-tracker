import { Disc3, Flame, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SetMenuProps {
  /** Working-set number ("1", "2"…) or "Warm-up". */
  label: string;
  warmup: boolean;
  /** Plates per side for this set's weight (barbell exercises only), e.g. "45 + 25 per side". */
  plates: string | null;
  weightText: string;
  onToggleWarmup: () => void;
  onDelete: () => void;
}

/**
 * The set's number doubles as its menu: mark it as a warm-up, see the plates for its weight, or delete it. Keeping
 * these behind the number leaves each row with just reps, weight and the check.
 */
export function SetMenu({ label, warmup, plates, weightText, onToggleWarmup, onDelete }: SetMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <span className="set-menu-wrap" ref={ref}>
      <button
        className={`set-num${warmup ? ' warmup' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Set ${label} options`}
      >
        {warmup ? 'W' : label}
      </button>
      {open && (
        <div className="menu set-menu" role="menu">
          <button className="menu-item" role="menuitemcheckbox" aria-checked={warmup} onClick={() => choose(onToggleWarmup)}>
            <Flame size={15} /> {warmup ? 'Make it a working set' : 'Warm-up set'}
          </button>
          {plates && (
            <div className="menu-note">
              <Disc3 size={15} />
              <span>
                <strong>{weightText}</strong>: {plates}
              </span>
            </div>
          )}
          <button className="menu-item danger" role="menuitem" onClick={() => choose(onDelete)}>
            <Trash2 size={15} /> Delete set
          </button>
        </div>
      )}
    </span>
  );
}
