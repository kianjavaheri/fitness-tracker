import { useState } from 'react';
import { AppleMark } from '../components/AppleMark';
import { GoogleMark } from '../components/GoogleMark';
import type { SignInProvider } from './AuthProvider';

/** Continue with Apple / Google, as on the sign-in screen and Settings (Apple first and no less prominent, per Apple). */
export function SignInButtons({ onSignIn }: { onSignIn: (provider: SignInProvider) => Promise<void> }) {
  const [busy, setBusy] = useState<SignInProvider | null>(null);

  const signIn = async (provider: SignInProvider) => {
    setBusy(provider);
    try {
      await onSignIn(provider);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sign-in-buttons">
      <button className="btn login-apple" onClick={() => void signIn('apple')} disabled={!!busy}>
        <AppleMark /> {busy === 'apple' ? 'Signing in…' : 'Continue with Apple'}
      </button>
      <button className="btn login-google" onClick={() => void signIn('google')} disabled={!!busy}>
        <GoogleMark /> {busy === 'google' ? 'Signing in…' : 'Continue with Google'}
      </button>
    </div>
  );
}
