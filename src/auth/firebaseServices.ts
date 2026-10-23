import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

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
  const auth = getAuth(app);
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
