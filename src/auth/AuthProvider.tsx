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

export type SignInProvider = 'apple' | 'google';

const PROVIDER_NAMES: Record<SignInProvider, string> = { apple: 'Apple', google: 'Google' };

interface AuthContextValue {
  /**
   * "disabled" when Firebase isn't configured for this build (local-only dev mode, no sign-in); "local" when it is
   * but this device chose to go without an account (data stays on the device; sign in from Settings to sync).
   */
  status: 'disabled' | 'local' | 'loading' | 'signed-out' | 'signed-in';
  user: AccountUser | null;
  error: string | null;
  signIn: (provider: SignInProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** From the sign-in screen: use the app on this device only. */
  continueWithoutAccount: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The Firebase SDK is large, so it's only downloaded when sign-in is configured. */
const loadSession = () => import('./session');

/** This device chose to go without an account. Not loading Firebase at all then keeps it fast and fully offline. */
const NO_ACCOUNT_KEY = 'lifttrack:no-account';

function readNoAccount() {
  try {
    return localStorage.getItem(NO_ACCOUNT_KEY) === '1';
  } catch {
    return false;
  }
}

function saveNoAccount(on: boolean) {
  try {
    if (on) localStorage.setItem(NO_ACCOUNT_KEY, '1');
    else localStorage.removeItem(NO_ACCOUNT_KEY);
  } catch {
    // Private mode etc.: the sign-in screen shows again next time.
  }
}

type Profile = { displayName: string | null; email: string | null; photoURL: string | null };

/**
 * The account as shown in the app. With Apple and Google linked, the account's own name or photo can be empty (Apple
 * has no photo, and signing in with it can clear the one Google gave), so each falls back to a linked sign-in's.
 */
const toAccount = (u: Profile & { uid: string; providerData: Profile[] }): AccountUser => ({
  uid: u.uid,
  name: u.displayName ?? u.providerData.find((p) => p.displayName)?.displayName ?? null,
  email: u.email ?? u.providerData.find((p) => p.email)?.email ?? null,
  photoURL: u.photoURL ?? u.providerData.find((p) => p.photoURL)?.photoURL ?? null,
});

/**
 * Sign-in is offered whenever Firebase is configured:
 * - while the saved session is restored, a splash shows (returning users go straight in);
 * - signed-out visitors get the sign-in screen, and the URL they asked for is kept, so they
 *   land on it after signing in;
 * - signing out clears this account's cached data from the device and returns to sign-in;
 * - or the sign-in screen's "Use without an account" keeps everything on this device (LocalRepository) and skips the
 *   screen from then on. Signing in later (Settings) offers to copy that data into the account (MigrationPrompt).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState(() => firebaseConfigured && readNoAccount());
  const [status, setStatus] = useState<AuthContextValue['status']>(!firebaseConfigured ? 'disabled' : local ? 'local' : 'loading');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { confirm } = useFeedback();

  useEffect(() => {
    if (!firebaseConfigured || local) return;
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
            setUser(toAccount(fbUser));
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
  }, [attempt, local]);

  const signIn = async (provider: SignInProvider): Promise<void> => {
    setError(null);
    // Signing in from no-account mode: a redirect sign-in leaves the page, and must come back to the normal flow.
    const wasLocal = local;
    if (wasLocal) saveNoAccount(false);
    try {
      const session = await loadSession();
      await (provider === 'apple' ? session.signInWithApple() : session.signInWithGoogle());
      const signedIn = session.currentUser();
      if (signedIn) {
        // Signed in with the email's first provider after the other was refused: add that one to this account.
        await session.linkPendingSignIn();
        await session.restoreProfile();
        // Read again: Apple's name is only added to the account after it signs in.
        setUser(toAccount(signedIn));
        if (wasLocal) {
          // Starts watching the account (the effect above), which switches to its data.
          setStatus('loading');
          setLocal(false);
        }
      } else if (wasLocal) {
        saveNoAccount(true); // cancelled
      }
    } catch (err) {
      console.error(err);
      if (wasLocal) saveNoAccount(true);
      const { code, customData } = err as { code?: string; customData?: { email?: string } };
      if (code === 'auth/account-exists-with-different-credential') return linkToExisting(provider, customData?.email);
      const offline = code === 'auth/network-request-failed' || !navigator.onLine;
      setError(
        offline
          ? "You're offline. Connect to the internet to sign in."
          : code === 'auth/operation-not-allowed'
            ? `Signing in with ${PROVIDER_NAMES[provider]} isn't turned on yet.`
            : 'Sign-in failed. Please try again.',
      );
      // If the SDK itself failed to load, retry loading it on the next attempt.
      if (!user && !wasLocal) setAttempt((n) => n + 1);
    }
  };

  /**
   * One account per email: this email already has an account through the other provider. Once signed in with that,
   * the refused sign-in is added to it (session.linkPendingSignIn), so either one opens the same account later.
   */
  const linkToExisting = async (provider: SignInProvider, email: string | undefined) => {
    const other: SignInProvider = provider === 'apple' ? 'google' : 'apple';
    const ok = await confirm({
      title: `Continue with ${PROVIDER_NAMES[other]}`,
      message: `${email ?? 'This email'} already has an account through ${PROVIDER_NAMES[other]}. Sign in with ${PROVIDER_NAMES[other]} once and ${PROVIDER_NAMES[provider]} will open the same account from then on.`,
      confirmLabel: `Continue with ${PROVIDER_NAMES[other]}`,
    });
    if (ok) return signIn(other);
    (await loadSession()).forgetPendingSignIn();
  };

  const continueWithoutAccount = () => {
    saveNoAccount(true);
    setActiveRepository(localRepo);
    setError(null);
    setLocal(true);
    setStatus('local');
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
  else if (status === 'signed-out') content = <LoginScreen onSignIn={signIn} onSkip={continueWithoutAccount} error={error} />;

  return (
    <AuthContext.Provider value={{ status, user, error, signIn, signOut, continueWithoutAccount }}>
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
