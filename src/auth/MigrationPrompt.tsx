import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { pluralize } from '../core/format';
import type { Snapshot } from '../core/types';
import { localRepo, repo } from '../data';

const decisionKey = (uid: string) => `fitness-tracker:local-copy:${uid}`;

function readDecision(uid: string) {
  try {
    return localStorage.getItem(decisionKey(uid));
  } catch {
    return null;
  }
}

function saveDecision(uid: string, value: 'copied' | 'skipped') {
  try {
    localStorage.setItem(decisionKey(uid), value);
  } catch {
    // Private mode etc.: worst case we ask again next time.
  }
}

/**
 * After the first sign-in on a device that already has workouts logged locally,
 * offers to copy them into the account. Asked once per account per device.
 */
export function MigrationPrompt({ uid }: { uid: string }) {
  const [local, setLocal] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readDecision(uid)) return;
    let cancelled = false;
    void localRepo.exportSnapshot().then((snap) => {
      const hasData = snap.sessions.length + snap.workouts.length + snap.routines.length > 0;
      if (!cancelled && hasData) setLocal(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!local) return null;

  const close = (decision: 'copied' | 'skipped') => {
    saveDecision(uid, decision);
    setLocal(null);
  };

  const copy = async () => {
    setBusy(true);
    try {
      await repo.mergeSnapshot(local);
      close('copied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Copy this device's data?" onClose={() => close('skipped')}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        This device has {pluralize(local.sessions.length, 'logged workout')}, {pluralize(local.workouts.length, 'saved workout')} and{' '}
        {pluralize(local.routines.length, 'routine')} from before you signed in. Copy them into your account so they sync
        everywhere? Nothing already in your account is removed.
      </p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
        <button className="btn btn-sm" onClick={() => close('skipped')} disabled={busy}>
          Not now
        </button>
        <button className="btn btn-primary btn-sm" onClick={copy} disabled={busy}>
          {busy ? 'Copying…' : 'Copy to my account'}
        </button>
      </div>
    </Modal>
  );
}
