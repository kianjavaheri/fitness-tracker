import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, waitForPendingWrites } from 'firebase/firestore';
import { CloudRepository } from '../data/cloudRepository';
import { isNative } from '../native/platform';
import { stopNativeRest } from '../native/rest';
import { getFirebase } from './firebaseServices';

// Everything that touches the Firebase SDK at runtime. Loaded with a dynamic import by
// AuthProvider only when Firebase is configured.
//
// Sign-in persists across visits: getAuth() stores the session in IndexedDB, so returning
// users are restored by onAuthStateChanged without seeing the sign-in screen.

/** How long sign-out waits for unsynced edits to reach the server before asking. */
const SYNC_WAIT_MS = 4000;

function services() {
  const firebase = getFirebase();
  if (!firebase) throw new Error('Firebase is not configured');
  return firebase;
}

export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(services().auth, callback);
}

export function createCloudRepository(uid: string) {
  return new CloudRepository(services().db, uid);
}

/**
 * In the iPhone app Google won't sign in inside a web view, so the native Google sheet gets an ID token and Firebase
 * signs in with it. Needs VITE_GOOGLE_IOS_CLIENT_ID and VITE_GOOGLE_WEB_CLIENT_ID (see README).
 */
async function signInNatively() {
  const { auth } = services();
  const iOSClientId = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
  const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
  if (!iOSClientId || !webClientId) throw new Error('Google sign-in is not set up for the iPhone app');
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ google: { iOSClientId, iOSServerClientId: webClientId, mode: 'online' } });
  let idToken: string | null | undefined;
  try {
    const login = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
    idToken = 'idToken' in login.result ? login.result.idToken : null;
  } catch (err) {
    if (/cancel/i.test(String((err as Error).message ?? err))) return; // closed the Google sheet
    throw err;
  }
  if (!idToken) throw new Error('Google did not return an ID token');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

/** Popup sign-in, falling back to a full-page redirect where popups aren't allowed. */
export async function signInWithGoogle() {
  if (isNative) return signInNatively();
  const { auth } = services();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw err;
    }
  }
}

/** Surfaces an error from a redirect sign-in that just returned to the app (no-op otherwise). */
export async function checkRedirectResult() {
  if (isNative) return; // no redirects in the iPhone app
  await getRedirectResult(services().auth);
}

/**
 * True once every local write has been acknowledged by the server, false if that doesn't
 * happen within a few seconds (typically: offline).
 */
export async function pendingWritesSynced(): Promise<boolean> {
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), SYNC_WAIT_MS));
  return Promise.race([waitForPendingWrites(services().db).then(() => true as const), timeout]);
}

/**
 * Signs out and removes this account's offline copy of its data from the device, so the
 * next person on a shared device can't see it. The Firestore instance can't be reused
 * after clearing, so the caller reloads the page afterwards.
 */
export async function signOutAndClear() {
  const { auth, db } = services();
  await stopNativeRest().catch(() => {});
  await signOut(auth);
  if (isNative) {
    // So the next sign-in offers the account picker again instead of reusing this Google account.
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.logout({ provider: 'google' }).catch(() => {});
  }
  await terminate(db);
  await clearIndexedDbPersistence(db).catch((err) => console.warn('Could not clear offline cache', err));
  // Unconfirmed writes journaled by CloudRepository (only left if the user chose to discard them).
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('fitness-tracker:pending-writes:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
