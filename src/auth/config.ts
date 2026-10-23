// Firebase is optional: without these env vars the app runs local-only (no sign-in).
// See .env.example and the README for setup. This file must not import the Firebase SDK.
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
export const useFirebaseEmulators = env.VITE_FIREBASE_EMULATORS === 'true';
