import { Download, LogOut, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import type { Snapshot, ThemePreference, WeightUnit } from '../core/types';
import { repo } from '../data';
import { useSettings } from '../hooks/settings';

export function SettingsPage() {
  const { settings, update } = useSettings();
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
      if (!confirm(`Replace all data ${signedIn ? 'in your account' : 'on this device'} with this backup?`)) return;
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
                if (!confirm('Replace all data with demo data?')) return;
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
