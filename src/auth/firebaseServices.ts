import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

import { isNative } from '../native/platform';
import { firebaseConfig, firebaseConfigured, useFirebaseEmulators } from './config';

// Only imported (lazily) when Firebase is configured, so local-only builds never load the SDK.

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let services: FirebaseServices | null = null;

/** Lazily initialised Firebase app, auth and Firestore; null when not configured. */
export function getFirebase(): FirebaseServices | null {
  if (!firebaseConfigured) return null;
  if (services) return services;

  const app = initializeApp(firebaseConfig);
  // In the iPhone app, Google sign-in is native (session.ts), and getAuth's popup/redirect helper (an iframe from
  // authDomain) would hang in the web view; so just keep the session in IndexedDB.
  const auth = isNative ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  const db = initializeFirestore(app, {
    // Keeps working offline (e.g. in a gym basement) and syncs when back online.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Our records have optional fields; let Firestore drop undefined instead of throwing.
    ignoreUndefinedProperties: true,
  });

  if (useFirebaseEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  services = { app, auth, db };
  return services;
}
