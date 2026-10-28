import { X } from 'lucide-react';
import { useState } from 'react';
import { cancelResume } from '../core/sessions';
import type { Session } from '../core/types';
import { repo } from '../data';
import { Modal } from './Modal';

interface CancelWorkoutButtonProps {
  session: Session;
  label?: string;
  /** After the workout was deleted (not after a resumed one was put back). */
  onCancelled?: () => void;
  /** Puts a resumed workout back through the page's own copy (else it's saved directly). */
  onRestore?: (restored: Session) => void;
}

/**
 * "Cancel workout" with an in-app confirmation (the browser's confirm() would put a
 * second, ambiguous "Cancel" button next to it). Deletes the in-progress session, or, if it was a finished one
 * picked back up, puts it back as it was.
 */
export function CancelWorkoutButton({ session, label = 'Cancel workout', onCancelled, onRestore }: CancelWorkoutButtonProps) {
  const [asking, setAsking] = useState(false);
  const resumed = !!session.resumedFrom;

  const cancel = async () => {
    setAsking(false);
    if (resumed) {
      const restored = cancelResume(session);
      if (onRestore) onRestore(restored);
      else await repo.saveSession(restored);
      return;
    }
    await repo.deleteSession(session.id);
    onCancelled?.();
  };

  return (
    <>
      <button className="btn btn-danger btn-sm" onClick={() => setAsking(true)}>
        <X size={14} /> {label}
      </button>
      {asking && (
        <Modal title="Cancel this workout?" onClose={() => setAsking(false)}>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
            {resumed
              ? `“${session.name}” goes back to how it was when you finished it. Anything changed since resuming is undone.`
              : `Nothing from “${session.name}” will be saved, and it won't appear in your workouts.`}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
            <button className="btn btn-sm" autoFocus onClick={() => setAsking(false)}>
              Keep going
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--danger)', color: 'var(--page-base)' }} onClick={cancel}>
              Cancel workout
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
