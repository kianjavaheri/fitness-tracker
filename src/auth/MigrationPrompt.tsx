import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { pluralize } from '../core/format';
import { uniqueName } from '../core/plan';
import type { ID, Snapshot } from '../core/types';
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
 * What to copy from this device into the account without duplicating or overwriting anything:
 * - exercises the account already has (same library entry, or same name) are reused, and references remapped, so
 *   two devices' starter "Bench Press" don't become two exercises with split history;
 * - records already in the account (copied before) are left as they are, since the account is newer;
 * - copied workouts and routines get a free name if the account already uses theirs.
 */
function localCopy(local: Snapshot, account: Snapshot): Snapshot {
  const has = (list: { id: ID }[], id: ID) => list.some((r) => r.id === id);
  const nameKey = (name: string) => name.trim().toLowerCase();
  const remap = new Map<ID, ID>();
  for (const e of local.exercises) {
    if (has(account.exercises, e.id)) continue;
    const match = account.exercises.find((a) => (e.catalogId && a.catalogId === e.catalogId) || nameKey(a.name) === nameKey(e.name));
    if (match) remap.set(e.id, match.id);
  }
  const ex = (id: ID) => remap.get(id) ?? id;

  const takenWorkouts = [...account.workouts];
  const workouts = local.workouts
    .filter((w) => !has(account.workouts, w.id))
    .map((w) => {
      const copy = { ...w, name: uniqueName(w.name, takenWorkouts), exercises: w.exercises.map((slot) => ({ ...slot, exerciseId: ex(slot.exerciseId) })) };
      takenWorkouts.push(copy);
      return copy;
    });
  const takenRoutines = [...account.routines];
  const routines = local.routines
    .filter((r) => !has(account.routines, r.id))
    .map((r) => {
      const copy = { ...r, name: uniqueName(r.name, takenRoutines) };
      takenRoutines.push(copy);
      return copy;
    });
  return {
    ...local,
    exercises: local.exercises.filter((e) => !has(account.exercises, e.id) && !remap.has(e.id)),
    workouts,
    routines,
    sessions: local.sessions
      .filter((s) => !has(account.sessions, s.id))
      .map((s) => ({ ...s, entries: s.entries.map((entry) => ({ ...entry, exerciseId: ex(entry.exerciseId) })) })),
  };
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
    // Decided before writing, so an interrupted copy doesn't ask (and copy) again.
    saveDecision(uid, 'copied');
    try {
      await repo.mergeSnapshot(localCopy(local, await repo.exportSnapshot()));
      close('copied');
    } catch (err) {
      try {
        localStorage.removeItem(decisionKey(uid));
      } catch {
        // Nothing more to undo.
      }
      throw err;
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
