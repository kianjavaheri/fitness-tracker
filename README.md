# Fitness Tracker

A workout tracker: plan workouts and routines, check in to log sets/reps/weight, and chart progress per exercise.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

In dev, **Settings → Load demo data** fills ~10 weeks of Push/Pull/Legs history.

With Firebase configured (see below), signing in with Google is required and you stay signed in on that device until
you sign out. Without any configuration the app runs local-only: data lives in the browser's IndexedDB and there is
no sign-in, which is handy for UI work.

## Concepts

- **Exercise** – an entry in your list (weighted or bodyweight). The picker also searches a bundled library of ~750
  exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain); picking one copies it
  into your list. Regenerate it with `node scripts/build-exercise-catalog.mjs <exercises.json>`.
- **Workout** – reusable template of exercises with target sets × reps. Standalone, or part of one or more routines.
- **Routine** – ordered list of workouts. Check-in suggests the one after your last session from that routine.
- **Session** – one check-in. Seeded from a workout or freestyle; exercises can be added, swapped or removed while logging.

## Architecture

```
src/core/     Pure TypeScript domain: types, unit conversion, stats, session helpers. No React, no storage.
src/data/     Repositories: local (IndexedDB via Dexie) and cloud (Firestore), plus the switch between them.
src/auth/     Optional Google sign-in (Firebase). The SDK is lazy-loaded only when configured.
src/hooks/    React glue: useRepoQuery (re-runs on writes), useEditable (draft + autosave), settings.
src/pages/    Screens. Talk only to the `Repository` interface.
```

- **Storage is swappable.** `src/core/repository.ts` defines the `Repository` interface. `src/data/index.ts` exports
  `repo`, which forwards to local storage when signed out and to `CloudRepository` (Firestore, under `users/{uid}/…`)
  when signed in. On first sign-in the app offers to copy any data this device logged before sign-in existed. Signing
  out clears the account's offline copy from the device.
- **Weights are stored in kg** and converted at the UI edge, so the lb/kg toggle is lossless.
- **No analytics or tracking.** Firebase is used only for sign-in and storing your own data.

## Google sign-in (optional)

1. Create a project at https://console.firebase.google.com and add a **Web app**.
2. **Authentication → Sign-in method:** enable **Google**. Under **Settings → Authorized domains**, add the domain you
   deploy to (`localhost` is there by default).
3. **Firestore Database:** create a database, then deploy the rules in `firestore.rules` (each user can only access
   their own `users/{uid}` data):
   ```bash
   npx firebase login
   npx firebase deploy --only firestore:rules --project <your-project-id>
   ```
4. Copy `.env.example` to `.env.local` and fill in the values from the web app's config, then restart `npm run dev`.

### Trying it without a real project

The Firebase emulators provide a fake Google sign-in page and a local database (needs Java):

```bash
npm run emulators       # auth :9099, Firestore :8080, emulator UI :4000
npm run dev:emulator    # app wired to the emulators via .env.emulator
```

## Path to a native app

The UI is mobile-first (safe-area insets, bottom-sheet modals, PWA manifest). To ship to iOS/Android:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Fitness Tracker" com.example.fitnesstracker --web-dir dist
npm run build && npx cap add ios && npx cap add android
```

IndexedDB works inside the Capacitor WebView; if you later want SQLite, add another `Repository` implementation.
In a native app, Google sign-in needs a native plugin (e.g. `@capacitor-firebase/authentication`) instead of the web popup.
