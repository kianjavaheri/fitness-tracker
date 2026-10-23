import { useState } from 'react';
import { GoogleMark } from '../components/GoogleMark';
import { APP_NAME } from '../config';

export function LoginScreen({ onSignIn, error }: { onSignIn: () => Promise<void>; error: string | null }) {
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <h1 className="title" style={{ marginTop: 20 }}>
          {APP_NAME}
        </h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
          Sign in to see your workouts.
        </p>
        <button className="btn btn-primary login-google" onClick={signIn} disabled={busy}>
          <GoogleMark /> {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        {error && (
          <p className="small" role="alert" style={{ marginTop: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <p className="muted small" style={{ marginTop: 22, lineHeight: 1.5 }}>
          You'll stay signed in on this device until you sign out.
        </p>
      </div>
    </main>
  );
}
