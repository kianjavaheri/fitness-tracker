# Rerack

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

## iPhone app

`ios/` is a Capacitor shell around the same web build. Over the home-screen web app it adds real haptics, the rest
timer on the lock screen / Dynamic Island (a Live Activity, `ios/App/RestTimerWidget`) and a "Rest over" notification
that buzzes when the phone is locked. It's distributed through TestFlight with the Apple Developer Program. The web app
keeps working as before for everyone else.

The app bundles the web build, so `npm run deploy` doesn't update it: upload a new build (below).

### One-time: Google sign-in for the app

Google doesn't allow its sign-in page inside apps, so the app uses the native Google sheet and needs two client IDs
in `.env.local`:

1. Firebase console → Project settings → **Add app → iOS**, bundle ID `com.kianjavaheri.fitnesstracker` (you can
   skip downloading the config file). This creates an iOS OAuth client.
2. Google Cloud console → APIs & Services → **Credentials**, then add to `.env.local`:
   ```bash
   VITE_GOOGLE_IOS_CLIENT_ID=<"iOS client (auto created by Google Service)" client ID>
   VITE_GOOGLE_WEB_CLIENT_ID=<"Web client (auto created by Google Service)" client ID>
   ```

### One-time: Apple Developer Program

1. Enroll at developer.apple.com/programs (as an individual). Approval can take a day or two.
2. Xcode → Settings → **Accounts** → + → sign in with that Apple ID.
3. `npm run ios`, then in Xcode select the **App** target → **Signing & Capabilities** → Team: your name (not
   "Personal Team"). Do the same for the **RestTimerWidget** target. Keep "Automatically manage signing" on.
4. App Store Connect (appstoreconnect.apple.com) → Apps → **+ New App**: iOS, name of your choice, bundle ID
   `com.kianjavaheri.fitnesstracker`, any SKU.

### Try changes on your iPhone (live reload)

```bash
npm run ios:live
```

It points the app at the dev server on this Mac and opens Xcode: pick your plugged-in (or Wi-Fi paired) iPhone at the
top and press Run (▶) once. After that, saved changes show up on the phone within seconds, with no upload. The phone
must be on the same Wi-Fi as the Mac; allow "find devices on your local network" the first time. You sign in once in
this mode (it's a separate copy of the app's storage). Run it again from Xcode only after changing native code (Swift,
plugins, Info.plist). It replaces the TestFlight copy on the phone until you install from TestFlight again.

Ctrl+C stops it and switches the app back to its bundled web build. Archived (Release) builds always open their
bundled copy anyway, so a TestFlight build can't end up loading from your Mac. Still run `npm run ios` before archiving,
so the bundled copy is your latest code.

### Ship a build

1. `npm run ios` (builds the web app, copies it into `ios/`, opens Xcode; also undoes `ios:live`).
2. In Xcode, pick **Any iOS Device (arm64)** as the destination, then **Product → Archive**.
3. In the Organizer that opens: **Distribute App → TestFlight & App Store** → keep the defaults (Xcode bumps the
   build number for you) → Upload.
4. When App Store Connect has processed it (a few minutes; you get an email), open **TestFlight** on the iPhone and
   install. Add yourself under TestFlight → Internal Testing the first time.

TestFlight builds expire after 90 days; uploading a new one resets that. Friends can be added as external testers
(that needs a short Apple beta review the first time). To try a change on a plugged-in iPhone without uploading,
pick the iPhone as the destination in Xcode and press Run.

`scripts/ios-setup-project.rb` (already applied) adds the widget extension and the app's own Swift files to the Xcode
project; re-run it only if `ios/` is regenerated. `npm run icons` also writes the iPhone app icon and launch screen.
