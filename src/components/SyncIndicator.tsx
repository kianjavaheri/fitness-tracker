import { CloudOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { repo } from '../data';

/**
 * A small pill when changes can't reach the cloud: offline (they're kept on the device and sync later), or live sync
 * stopped with an error (the app shows what it has). Nothing is shown while syncing normally or in local-only mode.
 */
export function SyncIndicator() {
  const { status } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState<string | null>(() => repo.getSyncError?.() ?? null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const unsubscribe = repo.subscribe(() => setError(repo.getSyncError?.() ?? null));
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      unsubscribe();
    };
  }, []);

  if (status !== 'signed-in' || (online && !error)) return null;
  return (
    <div className="sync-pill" role="status" title={error ?? undefined}>
      <CloudOff size={14} />
      {online ? 'Not syncing · showing saved data' : "Offline · changes sync when you're back"}
    </div>
  );
}
