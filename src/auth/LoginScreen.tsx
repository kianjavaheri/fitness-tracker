import { APP_NAME } from '../config';
import type { SignInProvider } from './AuthProvider';
import { SignInButtons } from './SignInButtons';

export function LoginScreen({
  onSignIn,
  onSkip,
  error,
}: {
  onSignIn: (provider: SignInProvider) => Promise<void>;
  onSkip: () => void;
  error: string | null;
}) {
  return (
    <main className="login">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width={64} height={64} />
        <h1 className="title" style={{ marginTop: 20 }}>
          {APP_NAME}
        </h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
          Sign in to keep your workouts in sync.
        </p>
        <SignInButtons onSignIn={onSignIn} />
        {error && (
          <p className="small" role="alert" style={{ marginTop: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button className="btn-link login-skip" onClick={onSkip}>
          Use without an account
        </button>
        <p className="muted small" style={{ marginTop: 6, lineHeight: 1.5 }}>
          Your workouts stay on this device. You can sign in later from Settings.
        </p>
      </div>
    </main>
  );
}
