import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useFeedback } from '../components/Feedback';
import { localRepo, repo, setActiveRepository } from '../data';
import { firebaseConfigured } from './config';
import { LoginScreen } from './LoginScreen';
import { MigrationPrompt } from './MigrationPrompt';
import { Splash } from './Splash';

export interface AccountUser {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextValue {
  /** "disabled" when Firebase isn't configured for this build (local-only dev mode, no sign-in). */
  status: 'disabled' | 'loading' | 'signed-out' | 'signed-in';
  user: AccountUser | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The Firebase SDK is large, so it's only downloaded when sign-in is configured. */
const loadSession = () => import('./session');

/**
 * Sign-in is required whenever Firebase is configured:
 * - while the saved session is restored, a splash shows (returning users go straight in);
 * - signed-out visitors get the sign-in screen, and the URL they asked for is kept, so they
 *   land on it after signing in;
 * - signing out clears this account's cached data from the device and returns to sign-in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>(firebaseConfigured ? 'loading' : 'disabled');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { confirm } = useFeedback();

  useEffect(() => {
    if (!firebaseConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadSession()
      .then((session) => {
        if (cancelled) return;
        session.checkRedirectResult().catch((err) => {
          console.error(err);
          setError('Sign-in failed. Please try again.');
        });
        unsubscribe = session.watchAuth((fbUser) => {
          if (fbUser) {
            setActiveRepository(session.createCloudRepository(fbUser.uid));
            setUser({ uid: fbUser.uid, name: fbUser.displayName, email: fbUser.email, photoURL: fbUser.photoURL });
            setStatus('signed-in');
          } else {
            setActiveRepository(localRepo);
            setUser(null);
            setStatus('signed-out');
          }
        });
      })
      .catch((err) => {
        // Usually offline on a first visit: the sign-in code couldn't be downloaded.
        console.error(err);
        setError("Couldn't reach the sign-in service. Check your connection and try again.");
        setStatus('signed-out');
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [attempt]);

  const signIn = async () => {
    setError(null);
    try {
      await (await loadSession()).signInWithGoogle();
    } catch (err) {
      console.error(err);
      const offline = (err as { code?: string }).code === 'auth/network-request-failed' || !navigator.onLine;
      setError(offline ? "You're offline. Connect to the internet to sign in." : 'Sign-in failed. Please try again.');
      // If the SDK itself failed to load, retry loading it on the next attempt.
      if (!user) setAttempt((n) => n + 1);
    }
  };

  const signOut = async () => {
    // The app is covered from the start, so nothing can be edited while waiting for the sync (an edit then would be
    // sent after signing out and lost without the warning below).
    setSigningOut(true);
    const session = await loadSession();
    // Let the covered pages unmount first, so anything they save on the way out is in the flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await repo.flush?.();
    if (!(await session.pendingWritesSynced())) {
      const ok = await confirm({
        title: 'Sign out and lose unsynced changes?',
        message: "Some recent changes haven't synced yet, probably because you're offline. Signing out now will lose them.",
        confirmLabel: 'Sign out anyway',
        danger: true,
      });
      if (!ok) {
        setSigningOut(false);
        return;
      }
    }
    await session.signOutAndClear();
    // The cleared Firestore instance can't be reused; start fresh on the sign-in screen.
    window.location.replace('/');
  };

  let content: ReactNode = children;
  if (signingOut) content = <Splash message="Signing out…" immediate />;
  else if (status === 'loading') content = <Splash />;
  else if (status === 'signed-out') content = <LoginScreen onSignIn={signIn} error={error} />;

  return (
    <AuthContext.Provider value={{ status, user, error, signIn, signOut }}>
      {content}
      {status === 'signed-in' && user && !signingOut && <MigrationPrompt uid={user.uid} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
