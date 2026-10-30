import { ArrowLeft, Download, LogOut, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SignInButtons } from '../auth/SignInButtons';
import { Avatar } from '../components/Avatar';
import { useFeedback } from '../components/Feedback';
import { RestLength } from '../components/RestLength';
import { checkSnapshot } from '../core/backup';
import { pluralize } from '../core/format';
import { DEFAULT_REST_SECONDS, type ThemePreference, type WeightUnit } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';
import { useSessions } from '../hooks/useRepo';
import { appleHealthOn, healthSupported, healthWorkouts, saveAllToAppleHealth, setAppleHealth } from '../native/health';
import { canGoBack } from '../utils/history';

/** iPhone app only: save finished workouts to Apple Health (per phone, since Health permission is). */
function AppleHealthCard() {
  const sessions = useSessions();
  const { notify } = useFeedback();
  const [on, setOn] = useState(appleHealthOn);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    const next = await setAppleHealth(!on);
    setOn(next);
    setNote(!on && !next ? 'Health didn’t allow it. Turn on Rerack in the Health app → Sharing → Apps, then try again.' : null);
  };
  // Only workouts finished while it's on are saved, so earlier ones can be added in one go.
  const past = sessions ? healthWorkouts(sessions).length : 0;
  const savePast = async () => {
    if (!sessions) return;
    setSaving(true);
    await saveAllToAppleHealth(sessions);
    setSaving(false);
    setNote(null);
    notify(`Saved ${pluralize(past, 'workout')} to Apple Health`);
  };
  return (
    <div className="card">
      <div className="spread" style={{ flexWrap: 'nowrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Apple Health</div>
          <div className="muted small">
            Save each workout you finish as strength training. They’re in the Fitness app, and in Health under Browse → Activity → Workouts.
          </div>
        </div>
        <button type="button" className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label="Save workouts to Apple Health" onClick={() => void toggle()} />
      </div>
      {on && past > 0 && (
        <button className="btn btn-sm" style={{ marginTop: 10 }} disabled={saving} onClick={() => void savePast()}>
          {saving ? 'Saving…' : `Save past workouts (${past})`}
        </button>
      )}
      {note && (
        <div className="small" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {note}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const { confirm } = useFeedback();
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const exportData = async () => {
    const snapshot = await repo.exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-tracker-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup downloaded.');
  };

  const importData = async (file: File) => {
    try {
      const snapshot: unknown = JSON.parse(await file.text());
      // Checked before asking, so a wrong file says so instead of "Restore this backup?".
      checkSnapshot(snapshot);
      const ok = await confirm({
        title: 'Restore this backup?',
        message: `Everything ${signedIn ? 'in your account' : 'on this device'} is replaced with the backup. This can't be undone.`,
        confirmLabel: 'Replace my data',
        danger: true,
      });
      if (!ok) return;
      await repo.importSnapshot(snapshot);
      setStatus('Backup restored.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <>
      {/* In the app Settings is opened from the account button, not a tab, so it has a way back. */}
      <button className="back-link app-only" onClick={() => (canGoBack() ? navigate(-1) : navigate('/', { replace: true }))}>
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="title">Settings</h1>

      <div className="stack" style={{ marginTop: 24, maxWidth: 680 }}>
        {auth.status === 'signed-in' && <AccountCard />}
        {auth.status === 'local' && <SignInCard />}

        <div className="card">
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Weight unit</div>
              <div className="muted small">Switching converts everything; nothing is lost.</div>
            </div>
            <div className="segmented">
              {(['lb', 'kg'] as WeightUnit[]).map((u) => (
                <button key={u} className={settings.unit === u ? 'on' : ''} onClick={() => update({ unit: u })}>
                  {u === 'lb' ? 'Pounds' : 'Kilograms'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Rest timer</div>
              <div className="muted small">
                {settings.restTimer === false
                  ? 'Off: no rest bar or rest times during workouts.'
                  : 'Starts when you check off a set during a live workout. Exercises can have their own length.'}
              </div>
            </div>
            <button
              type="button"
              className={`switch${settings.restTimer !== false ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.restTimer !== false}
              aria-label="Rest timer"
              onClick={() => update({ restTimer: settings.restTimer === false })}
            />
          </div>
          {settings.restTimer !== false && (
            <div className="spread" style={{ marginTop: 14 }}>
              <div className="muted small">
                Default length, up to 60 minutes.{' '}
                {(settings.restSeconds ?? DEFAULT_REST_SECONDS) === 0 ? 'At 0:00 it only starts when you tap Start.' : '0:00: only when you tap Start.'}
              </div>
              <RestLength seconds={settings.restSeconds ?? DEFAULT_REST_SECONDS} onChange={(restSeconds) => update({ restSeconds })} />
            </div>
          )}
        </div>

        {healthSupported && <AppleHealthCard />}

        <div className="card">
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Appearance</div>
              <div className="muted small">System follows your device setting.</div>
            </div>
            <div className="segmented">
              {(['system', 'light', 'dark'] as ThemePreference[]).map((t) => (
                <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => update({ theme: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="spread" style={{ flexWrap: 'nowrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Intro</div>
              <div className="muted small">How routines, workouts and exercises fit together, and a quick way to set up a routine.</div>
            </div>
            <button className="btn btn-sm" onClick={() => update({ introDone: false })}>
              Show again
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Your data</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {signedIn
              ? 'Synced to your account and available offline. You can still export a backup file.'
              : 'Stored on this device only. Export a backup to keep it safe or move it.'}
          </div>
          <div className="row-wrap" style={{ marginTop: 16 }}>
            <button className="btn btn-sm" onClick={exportData}>
              <Download size={15} /> Export backup
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Restore backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importData(f);
                e.target.value = '';
              }}
            />
          </div>
          {import.meta.env.DEV && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
              onClick={async () => {
                if (!(await confirm({ title: 'Load demo data?', message: 'Replaces all data with demo data.', confirmLabel: 'Replace', danger: true }))) return;
                const { demoSnapshot } = await import('../data/demo');
                await repo.importSnapshot(demoSnapshot());
                setStatus('Demo data loaded.');
              }}
            >
              Load demo data (dev only)
            </button>
          )}
          {status && <div className="small" style={{ marginTop: 12 }}>{status}</div>}
        </div>

      </div>
    </>
  );
}

/** Using the app without an account: sign in to sync (and back up) what's on this device. */
function SignInCard() {
  const { signIn, error } = useAuth();
  return (
    <div className="card">
      <div style={{ fontWeight: 600, fontSize: 15 }}>Account</div>
      <div className="muted small">
        Your workouts are only on this device. Sign in to keep them in sync across devices and safe if you lose this one.
      </div>
      <div style={{ maxWidth: 320 }}>
        <SignInButtons onSignIn={signIn} />
      </div>
      {error && (
        <div className="small" role="alert" style={{ marginTop: 10, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function AccountCard() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div className="card">
      <div className="spread">
        <div className="row" style={{ minWidth: 0 }}>
          <Avatar user={user} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name ?? 'Signed in'}</div>
            <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.email}
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={signOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
