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
    // Not an archived one: the copied history would sit under an exercise that's hidden.
    const match = account.exercises.find((a) => !a.archived && ((e.catalogId && a.catalogId === e.catalogId) || nameKey(a.name) === nameKey(e.name)));
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
  const [error, setError] = useState<string | null>(null);

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
    // The copy is one batch that only finishes online; offline it would sit at "Copying…" forever.
    if (!navigator.onLine) {
      setError("You're offline. Copy when you're back online.");
      return;
    }
    setError(null);
    setBusy(true);
    // Decided before writing, so an interrupted copy doesn't ask (and copy) again.
    saveDecision(uid, 'copied');
    try {
      await repo.mergeSnapshot(localCopy(local, await repo.exportSnapshot()));
      // It's in the account now. Left on the device, it would be offered to the next account signed in here.
      await localRepo
        .importSnapshot({ ...local, exercises: [], workouts: [], routines: [], sessions: [] })
        .catch((err) => console.warn('Could not clear the copied data from this device', err));
      close('copied');
    } catch (err) {
      console.error(err);
      try {
        localStorage.removeItem(decisionKey(uid));
      } catch {
        // Nothing more to undo.
      }
      setError("Couldn't copy it. Check your connection and try again.");
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
      {error && (
        <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {error}
        </p>
      )}
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
