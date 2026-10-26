import { Download, LogOut, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { useFeedback } from '../components/Feedback';
import { NumericInput } from '../components/NumericInput';
import { DEFAULT_REST_SECONDS, type Snapshot, type ThemePreference, type WeightUnit } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';

/** Longest rest the timer takes: 60:00. */
const MAX_REST_SECONDS = 60 * 60;

/** Rest length as minutes and seconds, any length up to 60:00; 0:00 turns the automatic start off. */
function RestLength({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  // Kept here while editing: the saved setting comes back a moment later, and typing seconds right after minutes
  // must not combine them with the old minutes. Follows the saved value when it changes (e.g. on another device).
  const [total, setTotal] = useState(seconds);
  const [saved, setSaved] = useState(seconds);
  if (seconds !== saved) {
    setSaved(seconds);
    setTotal(seconds);
  }
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const set = (m: number, s: number) => {
    const next = Math.min(MAX_REST_SECONDS, m * 60 + s);
    setTotal(next);
    onChange(next);
  };
  const digits = (text: string, max: number) => (text ? Math.min(max, parseInt(text, 10)) : 0);
  return (
    <div className="rest-length">
      <label>
        <NumericInput
          className="rest-field"
          ariaLabel="Rest minutes"
          value={min}
          format={(v) => String(v ?? 0)}
          parse={(t) => digits(t, 60)}
          onChange={(m) => set(m ?? 0, (m ?? 0) >= 60 ? 0 : sec)}
        />
        <span className="muted small">min</span>
      </label>
      <label>
        <NumericInput
          className="rest-field"
          ariaLabel="Rest seconds"
          value={sec}
          format={(v) => String(v ?? 0).padStart(2, '0')}
          parse={(t) => digits(t, 59)}
          onChange={(s) => set(min, min >= 60 ? 0 : (s ?? 0))}
        />
        <span className="muted small">sec</span>
      </label>
    </div>
  );
}

export function SettingsPage() {
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
      const snapshot = JSON.parse(await file.text()) as Snapshot;
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
      <h1 className="title">Settings</h1>

      <div className="stack" style={{ marginTop: 24, maxWidth: 680 }}>
        {auth.status === 'signed-in' && <AccountCard />}

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
          <div className="spread">
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Rest timer</div>
              <div className="muted small">
                Starts when you check off a set during a live workout, up to 60 minutes.{' '}
                {(settings.restSeconds ?? DEFAULT_REST_SECONDS) === 0 ? 'Off at 0:00: only when you tap Start.' : '0:00 turns it off.'}
              </div>
            </div>
            <RestLength seconds={settings.restSeconds ?? DEFAULT_REST_SECONDS} onChange={(restSeconds) => update({ restSeconds })} />
          </div>
        </div>

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
