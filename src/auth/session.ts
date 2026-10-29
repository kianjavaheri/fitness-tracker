import {
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  linkWithCredential,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type AuthCredential,
  type AuthProvider,
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

/** The signed-in user right now (after a sign-in call resolves), or null if it was cancelled. */
export function currentUser(): User | null {
  return services().auth.currentUser;
}

/**
 * Puts a name or photo back on the account from a linked sign-in when the account's own is empty: Apple gives no
 * photo, and signing in with it can leave a Google-linked account without the one it had.
 */
export async function restoreProfile() {
  const user = currentUser();
  if (!user) return;
  const photoURL = user.photoURL ?? user.providerData.find((p) => p.photoURL)?.photoURL ?? null;
  const displayName = user.displayName ?? user.providerData.find((p) => p.displayName)?.displayName ?? null;
  if (photoURL === user.photoURL && displayName === user.displayName) return;
  await updateProfile(user, { photoURL, displayName }).catch((err) => console.warn('Could not restore profile', err));
}

/**
 * One account per email (Firebase's "link accounts that use the same email" setting): signing in with Apple when that
 * email already has an account through Google (or the other way round) is refused with
 * auth/account-exists-with-different-credential. The refused sign-in is kept here; once the person signs in with the
 * provider they used before, `linkPendingSignIn` adds it to that account, so both lead to the same data from then on.
 */
let pendingLink: AuthCredential | null = null;

/** Keeps the sign-in an account-exists error refused (its own credential if we made one, else from the error). */
function keepForLinking(err: unknown, credential: AuthCredential | null) {
  if ((err as { code?: string }).code !== 'auth/account-exists-with-different-credential') return;
  const fromError = OAuthProvider.credentialFromError(err as never) ?? GoogleAuthProvider.credentialFromError(err as never);
  pendingLink = credential ?? fromError;
}

/** After signing in with the account's first provider: adds the sign-in that was refused, if there is one. */
export async function linkPendingSignIn() {
  const link = pendingLink;
  pendingLink = null;
  const user = currentUser();
  if (!link || !user) return;
  // Already linked, or that Apple / Google login belongs to another account: carry on signed in as is.
  await linkWithCredential(user, link).catch((err) => console.warn('Could not link sign-in', err));
}

export function forgetPendingSignIn() {
  pendingLink = null;
}

/** Signs in with a credential from a native sheet, keeping it for linking if the email has another account. */
async function signInNativeCredential(credential: AuthCredential) {
  try {
    return await signInWithCredential(services().auth, credential);
  } catch (err) {
    keepForLinking(err, credential);
    throw err;
  }
}

export function createCloudRepository(uid: string) {
  return new CloudRepository(services().db, uid);
}

/**
 * In the iPhone app Google won't sign in inside a web view, so the native Google sheet gets an ID token and Firebase
 * signs in with it. Needs VITE_GOOGLE_IOS_CLIENT_ID and VITE_GOOGLE_WEB_CLIENT_ID (see README).
 */
async function signInNatively() {
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
  await signInNativeCredential(GoogleAuthProvider.credential(idToken));
}

/** Popup sign-in, falling back to a full-page redirect where popups aren't allowed. */
async function popupSignIn(provider: AuthProvider) {
  const { auth } = services();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      keepForLinking(err, null);
      throw err;
    }
  }
}

export async function signInWithGoogle() {
  if (isNative) return signInNatively();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await popupSignIn(provider);
}

/** A random string for Apple's one-time nonce: Apple gets its SHA-256, Firebase the original to check against it. */
async function nonces() {
  const raw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

/**
 * In the iPhone app, Apple's own sheet (no web page) gets an ID token and Firebase signs in with it. Apple gives the
 * name only the first time, so it's kept as the account's display name then.
 */
async function signInWithAppleNatively() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ apple: { redirectUrl: '' } });
  const nonce = await nonces();
  let result;
  try {
    result = (await SocialLogin.login({ provider: 'apple', options: { nonce: nonce.hashed } })).result;
  } catch (err) {
    if (/cancel|1001/i.test(String((err as Error).message ?? err))) return; // closed Apple's sheet
    throw err;
  }
  const idToken = 'idToken' in result ? result.idToken : null;
  if (!idToken) throw new Error('Apple did not return an ID token');
  const { user } = await signInNativeCredential(new OAuthProvider('apple.com').credential({ idToken, rawNonce: nonce.raw }));
  const profile = 'profile' in result ? result.profile : null;
  const name = [profile?.givenName, profile?.familyName].filter(Boolean).join(' ');
  if (!user.displayName && name) await updateProfile(user, { displayName: name }).catch(() => {});
}

export async function signInWithApple() {
  if (isNative) return signInWithAppleNatively();
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  await popupSignIn(provider);
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
    await SocialLogin.logout({ provider: 'apple' }).catch(() => {});
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
