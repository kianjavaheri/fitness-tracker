import { X } from 'lucide-react';
import { useState } from 'react';
import type { Session } from '../core/types';
import { repo } from '../data';
import { Modal } from './Modal';

/**
 * "Cancel workout" with an in-app confirmation (the browser's confirm() would put a
 * second, ambiguous "Cancel" button next to it). Deletes the in-progress session.
 */
export function CancelWorkoutButton({ session, label = 'Cancel workout', onCancelled }: { session: Session; label?: string; onCancelled?: () => void }) {
  const [asking, setAsking] = useState(false);

  const cancel = async () => {
    await repo.deleteSession(session.id);
    setAsking(false);
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
            Nothing from “{session.name}” will be saved, and it won't appear in your workouts.
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
