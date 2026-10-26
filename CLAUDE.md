# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

LiftTrack (`APP_NAME` in `src/config.ts`; the repo, bundle ID and Firebase project still say `fitness-tracker`), a
personal workout tracker (React 19 + TypeScript + Vite). Meant to replace a notes app for logging lifts: plan
workouts/routines, check in to log sets, view progress charts. A web app (also installable as a home-screen PWA) plus
an iPhone app: a Capacitor shell in `ios/`, shipped through TestFlight (see **iPhone app** below and the README).
The user commits and deploys themselves; never offer to.

## Commands

```bash
npm run dev            # http://localhost:5173 (sign-in required if .env.local has Firebase config, else local-only)
npm run build          # tsc -b && vite build — the type check is part of the build
npx tsc -b             # type check only
npm run lint           # oxlint (.oxlintrc.json)
npm run emulators      # Firebase auth :9099 + Firestore :8080 + UI :4000 (needs Java)
npm run dev:emulator   # app wired to the emulators via .env.emulator (demo project, no real Firebase)
node scripts/build-exercise-catalog.mjs <exercises.json>   # regenerate src/data/exerciseCatalog.json
npm run deploy         # build + Firebase Hosting (project in .firebaserc; needs `npx firebase login` once)
npm run icons          # regenerate home-screen/PWA PNGs in public/ from public/app-icon.svg
npm run ios            # build, sync into ios/ and open Xcode (Archive there to upload to TestFlight)
npm run ios:live       # phone app loads the Vite dev server (edits show in seconds); Ctrl+C undoes it
```

**Installable app (PWA).** `vite-plugin-pwa` (in `vite.config.ts`) generates the manifest and a service worker that
precaches the app shell, so the home-screen app opens with no signal (data offline comes from Firestore's persistent
cache). `registerType: 'prompt'` with no UI: a new version waits until the app is fully closed, so it never reloads
mid-workout. `/__/` (Firebase Hosting's sign-in handler) is excluded from the navigation fallback — keep it that way.
The service worker only exists in builds; test it with the `preview-build` launch config.

There is no test suite. Verify changes in the browser; in dev, **Settings → Load demo data** (or importing
`src/data/demo.ts` and calling `repo.importSnapshot(demoSnapshot())`) gives ~10 weeks of history to look at. When
driving `repo` from the browser console after hot reloads, import the exact URL the app uses
(`performance.getEntriesByType('resource')` shows e.g. `/src/data/index.ts?t=…`) or reload first: a plain
`import('/src/data/index.ts')` can be a second instance whose writes reach IndexedDB but never notify the UI.
`.claude/launch.json`: `web` (:5173, real Firebase → sign-in), `web-local` (:5175, Firebase key blanked → local-only, no
sign-in; use this for UI checks), `preview-build` (:4173, built app + service worker), `firebase-emulators`,
`web-emulator`. For phone layouts: resize to mobile and add the `standalone` class to `<html>` (bottom tabs, swipes).
Touch gestures can be driven with `new Touch(...)` + `TouchEvent`. When the browser pane is hidden,
requestAnimationFrame, CSS animations and timers are paused/throttled, so only check end states there.

TS config uses `verbatimModuleSyntax` (use `import type`) and `erasableSyntaxOnly` (no enums, no constructor
parameter properties). Remaining lint warnings (`react(purity)` for `Date.now()` in render, `only-export-components`)
are known and accepted.

## Architecture

**Layers** — keep the dependency direction:
- `src/core/` — pure TS domain logic, no React/storage: `types.ts` (all records are plain serializable data, ISO
  timestamp strings, no classes), `stats.ts` (per-exercise history, e1RM, PRs, routine "up next", workout-level
  indexed progress), `sessions.ts`, `activity.ts` (per-day aggregation, weeks), `similarity.ts` (fuzzy exercise-name
  matching), `units.ts`, `format.ts`. Put new calculations here, not in pages.
- `src/data/` — storage behind the `Repository` interface (`core/repository.ts`).
- `src/hooks/`, `src/components/`, `src/pages/` — UI. Pages only ever talk to `repo` from `src/data/index.ts`.

**Swappable storage.** `src/data/index.ts` exports `repo`, a `SwitchableRepository` that forwards to the active
implementation: `LocalRepository` (IndexedDB via Dexie) when signed out, `CloudRepository` (Firestore under
`users/{uid}/{exercises|workouts|routines|sessions}` + `users/{uid}/meta/settings`) when signed in. `AuthProvider`
calls `setActiveRepository` on auth changes; subscribers stay attached across swaps. `localRepo` is exported
separately for the first-sign-in "copy this device's data" flow (`auth/MigrationPrompt.tsx`).

`CloudRepository` serves reads from an in-memory mirror kept live by `onSnapshot`, applies writes to the mirror
immediately, and debounces the Firestore write per document (500 ms) because the UI saves on every keystroke. Deletes
cancel pending writes and don't await the server (offline-safe). Because a write can still be in its delay when the tab
closes, every queued write is also journaled synchronously to `localStorage` (`fitness-tracker:pending-writes:<uid>`,
merged per key so tabs don't clobber each other). An entry is dropped once Firestore has it (~3 s after handoff, its own
persistent queue takes over) or confirms it. Leftovers are replayed on start only if newer than the server copy: every
document is written with a `_savedAt` stamp, stripped from what the app sees. Listener errors don't blank the app
(`getSyncError()` → `SyncIndicator`). Backup restore validates first, writes, then deletes only what the backup lacks.

**Reactivity.** No state library. `useRepoQuery(fn)` re-runs a repository read whenever the repo emits a change.
The shared lists (`useSessions` etc.) pass a cache key, so a newly mounted page starts from the last result instead of
blank (tab switches and swipes draw at once); the cache is dropped when the data source swaps (`repoGeneration`).
Editor pages use `useEditable(load, save)`: local state is the source of truth while editing and every change
persists immediately, so inputs never fight async reloads. It also follows changes made elsewhere (another device or
tab): when the stored record differs from the draft (ignoring `updatedAt`/`lastActivityAt` and key order) and there
was no local edit in the last 2 s, the draft is replaced; deleted elsewhere → not found. So a page left open can't
save a stale copy over newer data. Two devices editing the same record within ~0.5 s is still last-write-wins.

**Sign-in is required when Firebase is configured** (`.env.local` has `VITE_FIREBASE_*`). `AuthProvider` gates the whole
app: blank → `Splash` (only if restoring takes >400 ms) → `LoginScreen` when signed out, else the app. Before any
JS runs, `index.html` shows the same loader (`.boot`: the app mark in a spinning coral ring, inline CSS, fading in
after 0.4 s); React replaces it and `Splash` reuses it with matching timing, so a slow start is one steady spinner. The gate sits
above the router, so the requested URL survives sign-in. Returning users are restored automatically from Firebase Auth's
IndexedDB persistence. Sign-out (avatar menu or Settings) flushes queued writes, waits up to 4 s for Firestore to
confirm them (asks before discarding if offline), then `signOutAndClear()` signs out, terminates Firestore, clears its
offline cache and reloads to `/`. Without Firebase config, `useAuth().status === 'disabled'`: no gate, local-only data —
handy for UI work.

**iPhone app.** Same web build in a Capacitor shell; see the **iPhone app** section.

**Firebase is lazy.** `auth/config.ts` reads the env vars and must not import the SDK. All SDK usage lives in
`auth/session.ts` + `auth/firebaseServices.ts` + `data/cloudRepository.ts`, reached only through a dynamic
`import('./session')` — keep it that way so the SDK (~190 KB gzip) stays out of the main bundle. Rules:
`firestore.rules`.
To exercise sign-in against the emulators from a script, `signInWithCredential(auth,
GoogleAuthProvider.credential(JSON.stringify({ sub, email, name })))` works with unsigned fake tokens.

## Domain rules that aren't obvious

- **Weights are stored in kg** (`SetLog.weightKg`) and converted only at the UI edge (`core/units.ts`); default
  display unit is lb.
- **A set counts once it has reps > 0 and isn't a warm-up** (`isCompletedSet`) for stats, "Previous", records and
  history. Warm-ups (`SetLog.warmup`, toggled from the set-number menu) show as "W"; last time's numbers (the set placeholders) line up by working set.
  `lastPerformanceWithDate` takes options: `before` (the session's own start, so back-dated logs look further back),
  `occurrence` (same exercise twice in a workout) and prefers real sessions over imported ones. The ✓ "done" flag drives
  progress while logging: an exercise is done when every set is checked (`isEntryDone`), shown as "2/5 exercises" in the
  session bar. `finalizeSession` keeps everything planned (skipped exercises stay visible when reopened); lists show
  only `loggedEntries`.
- An unfinished session is signalled everywhere: a pulsing blue ring on the tab bar's + (which then opens it) or a
  "● Live" pill in the top nav. A finished session can be resumed (`canResume`/`resumeSession`) only the same day,
  if it was logged live and nothing else is open.
- **Forgotten workouts**: every save from the session page stamps `Session.lastActivityAt`. An open session with no
  changes for 3 hours (`forgottenSession`) gets a prompt from any page (`components/ForgottenWorkout.tsx`): finish at
  the last change, keep going (re-stamps), or discard — only offered when nothing was logged. Never auto-finished.
- A **Session** with `finishedAt === null` is in progress; `live === false` means logged after the fact (no timer or
  duration; `finishedAt` is set to `startedAt`).
- **Routines** hold ordered `workoutIds` plus optional `days[workoutId]` (0 = Sun). "Up next" (`nextWorkoutInRoutine`)
  returns a workout planned for today, else the one after the last done from that routine, else **null** — never
  guess when there's no basis. Only the **followed** routine (`followedRoutine`: `settings.activeRoutineId`, or the
  only routine if there's one) drives Home's "Up next", the week strip's planned days and Check in's badges; with
  several and none picked, Home asks you to pick one (the circle on routine cards in Workouts → Plan).
- **Notes are sticky**: `Exercise.notes`/`links` and `Workout.notes` show every time it's logged (session note pads,
  Exercises form, workout editor). Links are http(s) only via `normalizeLink`. `WorkoutExercise.notes` is the
  separate per-slot note (e.g. "(slow)" from imports) shown under the exercise name.
- Progress metric for one number per session (`progressValue`): estimated 1RM (Epley) for weighted exercises, total
  reps for bodyweight. The "By workout" analytics view plots each exercise as % change from its first session so
  different loads share one axis (no dual axes).
- **Exercise library**: `src/data/exerciseCatalog.json` is generated from free-exercise-db (Unlicense; stretching
  excluded) and lazy-loaded by `data/catalog.ts`. Picking a library entry copies it into the user's list with
  `catalogId`. `linkToCatalog` converts/merges a personal exercise into its library version, keeping its id (so history
  is preserved) or remapping sessions/workouts when merging into an existing one. Exercises are soft-deleted
  (`archived`) so history keeps resolving.
- **Import from notes** (`/edit/import`): `core/importParser.ts` parses pasted text (headings, `2x8`, `3 sets of 10`,
  `70/140`, `45+10+10`, `(notes)`, trailing `or`) → `data/importPlan.ts` builds a review draft with matches and flags
  (`reps`, `missing`, `weight`, `match`, `alternative`) → `pages/ImportPage.tsx` blocks saving until every flag is
  resolved. A single rep number like `2x8` is treated as what was done, not a target range; all those questions are
  answered together. Optionally the noted weights are saved as a past session so "Previous" is filled in. Those
  sessions are marked `imported` (older ones only by their note) and `isImportedSession` keeps them out of daily
  activity — heatmap, week strip, "Trained today" — since they aren't a day you trained.
- **Workout and routine names are unique** (case-insensitive; `core/plan.ts`): a taken or blank name becomes the next
  free one ("Upper A 2") on blur/save, and new/imported ones get a free name. Workouts can be shared by routines;
  adding one that's already in another routine asks "same workout" vs "add a copy" (`cloneWorkout`), and the workout
  editor's Duplicate becomes "Separate copy for <routine>" when opened from a routine that shares it. Deleting a
  routine offers to delete workouts used only by it (sessions are always kept).
- **Press-and-hold menus**: workout cards (Plan, Check in), routine cards (Plan) and session cards (History) open an
  iOS-style context menu on press-and-hold or right-click (`useLongPress`, with a haptic → `components/ContextMenu.tsx`,
  which lifts a copy of the card over a light blur; actions in `components/WorkoutActions.tsx`: Share for
  workouts/routines, Rename, Delete). Routine delete there and in the editor is `components/DeleteRoutineDialog.tsx`.
- **Hold and drag to reorder** (`hooks/useDragReorder.ts`): workouts in the routine editor, exercises in the workout
  editor and in a session (hold the exercise name). After 350 ms still the item lifts with a haptic, the page stops
  scrolling by touch (touchmove `preventDefault`) and scrolls itself near the screen edges, the others slide aside, and
  letting go calls the same move as the arrow buttons (`move` / `moveUnlinked`). Moving first is a scroll. Slides
  and the drop use an even 280 ms ease-in-out (the app's front-loaded `--ease` at 0.2 s looked like popping), and
  offsets are cleared with transitions off before the list re-renders (else cards jump past and slide back). Every
  press-and-hold in the app gives a haptic when it takes effect.
- **No calories**: tracking them (typed in, or from Apple Health) was tried and dropped; typing them in wasn't worth
  the space. Reading Health is possible now that there's a paid Developer account, if it's ever revisited.
- **Duration**: `Session.durationMinutes` overrides the timer (null = deliberately none); back-logged sessions have
  none unless typed in. Use `sessionDurationMinutes`.
- Defaults for new exercise slots live in `src/config.ts` (`DEFAULT_SETS = 2`, `DEFAULT_REPS = '6-12'`).

## Naming / routes (user-facing names differ from early code names)

- Nav: **Home | Workouts | Analytics**, then the avatar account menu (Settings, Sign out) — or a gear icon in
  local-only mode — and the Light/Dark toggle. Home's orbs: Check in, Workouts, Analytics.
- Opened from the home screen (`html.standalone`, set by the inline script in `index.html` from
  `display-mode: standalone` / `navigator.standalone`), the top nav and Home's orbs are hidden and a floating bottom
  tab bar (`.tabbar`, Clock-app style, icons only, its own more see-through `--tabbar-glass`) shows Home, Workouts,
  a coral + (Check in), Analytics, Account. In the home-screen web app a solid strip
  (`.statusbar-scrim`) covers the status bar plus ~32px because iOS blurs that band and it can't be turned off; the
  iPhone app (`html.native`) has no blur, so its strip only backs the status bar and content starts just below.
  Bottom `.sticky-bar`s sit above the tabs. To test in a browser, add the `standalone` class to `<html>`.
- "Workouts" → `/workouts` → `pages/WorkoutsPage.tsx` with a **History | Plan** switch (`?view=plan`, `PLAN_PATH`).
  History = logged sessions (`WorkoutHistory` in `WorkoutLogPage.tsx`); Plan = routines, workouts, exercises,
  import (`WorkoutPlan` in `EditWorkoutsPage.tsx`). `/edit` redirects to Plan; editors keep `/edit/workouts/:id`,
  `/edit/routines/:id`, `/edit/exercises`, `/edit/import` and return to Plan.
- A logged session is `/session/:id`; check-in is `/check-in`. Use "Cancel workout" (not "Stop") for discarding an
  in-progress session — `components/CancelWorkoutButton.tsx` uses an in-app dialog, not `confirm()`; from the
  workout's page it returns to Check in.
- Editor pages accept `?from=<path>` so Save returns to where the user came from (e.g. back to a routine); validate it
  with `safeReturnPath` (rejects `//host`). Session pages go back with `navigate(-1)` when `canGoBack()`.
- **No `confirm()`/`alert()`**: `components/Feedback.tsx` (`useFeedback`) gives in-app `confirm({…})` dialogs and
  `notify(msg, { undo })` banners. Deletes act at once and offer Undo; only irreversible things (backup restore,
  signing out with unsynced changes) ask first. Starting a workout while one is open goes through `useStartSession`.
- **During a workout**: the set number is a menu (`SetMenu`: warm-up, plates per side via `core/plates.ts` for barbell
  lifts, delete). Checking a set starts the rest timer (`Session.restEndsAt`, length `Settings.restSeconds`, default
  120 s; any length up to 60:00, typed as minutes and seconds in Settings; 0 = only by hand). `RestTimer` is a bar pinned under Back for the whole live workout (so it never pops in
  and shifts the page): idle with "Start 2:00", running with ±15 s, coral when over. Its × sets `Session.restHidden`:
  a small unpinned "Rest timer" pill stays in place (tap to bring the bar back) and sets don't start rests meanwhile.
  In the iPhone app the rest also shows on the lock screen, buzzes when over (see **iPhone app**). "Go up"
  (`core/progression.ts`) suggests +5 lb / +2.5 kg when every working set last time hit the top of the rep range. The
  screen is kept awake (`useWakeLock`).
- **Supersets**: `supersetNext` on workout slots and session entries links an item to the next (`core/supersets.ts`),
  drawn as a coral-barred group; rest starts only after the group's last exercise. Moving/removing unlinks rather than
  silently re-forming a group. Same UI in the workout editor and while logging (`components/SupersetLink.tsx`): a link
  button at each exercise's bottom right and a dashed **Superset pill** under an exercise (or a group's last one). The
  editor shows every pill at first so the feature is discoverable; while logging they're hidden until the button is
  tapped (`usePills`). The button takes a linked exercise out (`leaveSuperset`: ends unlink in place, a middle one moves
  below; toast "Superset removed" + Undo via `restoreLinks`), else shows/hides its pill. Tapping a pill opens the
  exercise search with the workout's own exercises first, tagged "In this workout" (`supersetWith`: moves that slot in,
  or adds a new one — only to that session, never the saved workout). Holding an exercise and dropping it on a pill
  links it (`useDragReorder`'s `onDropOn`; while hovered the list holds still and the held exercise gets the pill's
  dashed coral outline, `.drop-ready`, since it covers the pill). Pills are nearly card-wide. An exercise pulled in by
  a drop or a search pick remembers where it was (`origins`, in memory); taking it out puts it back there
  (`placeAfter`), and `useSlotFlip` slides every card to its new place (cards carry `data-slot-id`).
- **Previous**: no "Previous" column in the set grid (last time's numbers are the placeholders). A history button
  beside the notes button on each exercise and on the workout opens `components/PreviousLog.tsx`: every earlier day's
  completed sets, newest first, grouped like "2 × 8 · 145 lb" (`exerciseLog`, `groupSets` in `core/stats.ts`). The
  workout's window is `exercisesLog`: every earlier session of any workout that had one of this session's exercises,
  showing just those, labelled with that session's name (so incline bench from a freestyle day shows for Upper B).
- The exercise search (`ExercisePicker`) focuses its field only with a mouse; on a phone the keyboard waits for a tap.
- **Share links**: `/share#<base64 JSON>` (`core/share.ts`) carries a workout or routine (exercises by name/catalogId,
  targets, notes, supersets, routine days) but no history; `data/shared.ts` adds it (matches exercises, unique names).
- In the app (`html.standalone`) Home opens with a greeting by time of day plus first name when signed in, and the
  date (`.home-greeting`; hidden on the web, where the top bar and orbs are).
- Home shows a week summary vs last week to the same weekday (`weekSoFar`); Analytics has a Records view
  (`exerciseRecords`).
- **Swipes (installed app only)**: an edge swipe goes back on `/session/…` and `/edit/…` pages (`useEdgeSwipeBack`).
  A sideways swipe on Home/Workouts/Check in/Analytics/Account moves to the neighbouring tab like a pager
  (`useTabSwipe`; Check in, behind the coral +, is a tab page too). Reaching Check in, the tab bar's highlight (`--i`)
  becomes a 54px circle around the 46px + (`--c`: clip-path plus top/bottom), a thin ring; it stays there on the workout
  in progress (`activeTab` in Layout; a finished workout counts as Workouts). Tab pages stay
  drawn between visits; one that must start fresh each visit reads `useTabActive()` (Check in resets to live/now). It
  has to feel like Apple's Health app: one continuous motion. How it works, and why:
  - The tab pages are drawn by `components/TabPager.tsx` (from `TAB_PAGES` in `pages/tabPages.tsx`), not the router's
    Outlet; App's routes for those paths have `element={null}`. The current tab's neighbours are drawn in idle time
    and, like every tab page once drawn, never unmounted; parked off screen as `.swipe-peek` (fixed, at
    `--pager-top/left/width`), all keyed by path so React keeps each page when its role changes. Finishing a swipe
    only swaps which page is current: nothing is rebuilt. Dropping the tab just left (and rebuilding it when idle,
    mid next swipe) caused freezes.
  - A drag moves the page, the neighbour and the tab bar highlight (`--i` on `.tab-indicator`) once per frame
    (requestAnimationFrame, `translate3d`). Every tab page is always its own layer (`will-change` in CSS): promoting
    the page when a drag began repainted it during the first frames. On release they continue at the finger's speed
    from the last drawn position (`settleMs` matches the ease curve's starting slope) and ease to rest over up to
    600 ms with `cubic-bezier(0.3, 0.8, 0.3, 1)` (measured from Health: finger speed held ~100 ms, ~450 ms in all);
    only then does the route change. The tab bar's active icon switches as the drag passes halfway (`markTab`), not
    when the route changes.
  - The router commits navigations as React transitions, a moment after `navigate`. `useTabSwipe` attaches its
    listeners once, reads the current tab from the DOM (`main.tab-page:not(.swipe-peek)`), and ignores new swipes
    until the swiped-to page is current; a swipe in that gap used to move the stale page and leave pages stuck.
  - iOS settles in a touch's first moves whether it scrolls, and once its own pan starts it cancels the touch (the
    swipe moved a little, then snapped back). In the iPhone app `AppViewController` adds a sideways pan recognizer
    (drags flatter than ~63°) that the scroll view's pan must wait to fail: with `alwaysBounceVertical` the scroll
    pan otherwise began on nearly every drag. On the web, tab pages have `touch-action: pan-y` and, while undecided, moves
    leaning sideways (past 3px) are `preventDefault`ed. Direction is lenient because thumbs swipe in arcs: after 10px,
    flatter than ~55° is a swipe, steeper than ~63° a scroll, in between it decides at 24px (a strict 34° rule made
    swipes fail to catch). A touch during the settle catches the page where it is and drags on from there (it can
    finish or undo the move under way, not skip a second tab). The rest of a touch is followed on its target element
    (events stop reaching the document if a re-render removes it); a drag whose end never arrives is put back on the
    next touch.
  - Earlier versions that rebuilt or swapped the page at release stuttered (60–90 ms freezes, blocked scrolls, a
    jump, a lagging tab bar). Don't render pages during or at the end of a swipe.
  - Skips inputs, charts (scrubbing), dialogs, sideways scrollers and `[data-no-swipe]`. `useRepoQuery` caches the
    shared lists so pages draw from data at once. Analytics' code is preloaded in idle time (`preloadTabPages`).

## Styling

- All styling is in `src/index.css` with CSS custom-property tokens; light on `:root`, dark on
  `[data-theme='dark']` (set by `hooks/settings.tsx`, which also keeps the theme choice in localStorage
  `lifttrack:theme` so `index.html` and the loader use it before settings load, not the phone's setting). Look and feel mirrors kianjavaheri.com: Google Sans Flex,
  gradient cards, full-width glass navbar, uppercase underlined CTAs; Antigravity-style round icon "orbs" on Home.
- Dark mode is near-black with a faint cool tint, after linear.app (`#08090a` base, `#0f1011` panel/app background,
  `~#18191b` cards, `#8a8f98` muted text). `--accent` is coral (`#ed5b53`: dark accent and `--accent-fill` in both
  themes; light text uses `#c9473c` for contrast) for badges, focus rings, highlights and the Check in +; `--danger`
  is a deliberately different red (rose `#ff4d72` in dark, so it doesn't read as the coral). Easing tokens: `--ease`,
  and `--ease-swipe` (`cubic-bezier(0.22, 1, 0.36, 1)`) for page swipes. Charts do **not** use `--accent`: their
  colors are in `components/chartTheme.ts` (blue single-series
  accent and a fixed-order 8-color categorical palette validated for colour-blind separation — don't cycle or
  reorder; >8 series must be capped).
- Home's Activity heatmap has 1W / 1M / 6M (remembered per device in localStorage): 6M is the compact grid with
  weeks as columns; 1W (this week, captioned "Oct 19 – 25") and 1M (this calendar month, captioned with its name,
  padded to whole Monday–Sunday weeks with the neighbouring months' dates, faded) are calendars that show the date.
  Stats count from the start of the week/month (`rangeLayout`). No 1Y: 52
  columns are too small to see or tap on a phone.
- Home's activity grid is deliberately two-state (rest gray / trained coral): you train at most once a day,
  and set counts mostly reflect which workout it was, so shading by volume was confusing. Don't reintroduce a ramp
  without labelling what it encodes.
- Navbar spans the full width (`.nav-inner`, slim `clamp()` gutter) while page content stays max 1200px; the signed-in
  avatar is 34px with extra spacing around it and the theme toggle.
- The user prefers compact sizing (13px nav, 15px base, 36px buttons) and plain, personal copy — no marketing
  taglines or branding. Check layouts at phone widths: breakpoints are 480/560/820/900/980px; on ≤560px the main
  panel goes edge-to-edge and the hub is a single row.

## iPhone app (`ios/`, Capacitor 8)

Bundle ID `com.kianjavaheri.fitnesstracker`; home-screen name LiftTrack; App Store Connect name "LiftTrack: Workout
Log" (TestFlight only, internal testing; Xcode Cloud isn't used). iOS 17+, iPhone only.

**Workflow.** `npm run ios:live` (scripts/ios-live.sh) points the app at the Vite dev server on this Mac and opens
Xcode; the user presses Run once with the iPhone selected, then web edits reload on the phone in seconds. Native
changes (Swift, plugins, Info.plist) need another Run. Live reload runs React's slower dev build, so judge smoothness
on a TestFlight build. Stopping it (Ctrl+C) re-copies the bundled config, and Release builds ignore `server.url`
(`AppViewController.instanceDescriptor`): a TestFlight build once shipped pointing at the Mac and showed only the gray
launch screen away from home Wi-Fi. Shipping: `npm run ios` (builds the latest web app into the bundle), then
Xcode → Any iOS Device → Product → Archive → Distribute App → **App Store Connect** (not "TestFlight Internal
Only").
The app bundles the web build: `npm run deploy` doesn't update it. App and widget must keep the same
MARKETING_VERSION / CURRENT_PROJECT_VERSION.

**Native pieces** (each a no-op on the web; `src/native/platform.ts` has `isNative` and `SITE_URL`; `index.html` adds
`standalone` + `native` classes so it looks like the home-screen app):
- `ios/App/App/SceneDelegate.swift` must make `AppViewController()` the root view controller. Capacitor's template
  creates a plain `CAPBridgeViewController()` there (the storyboard is ignored), and then none of our plugins exist —
  JS calls fail with `UNIMPLEMENTED`.
- `AppViewController.swift` registers this app's plugins (`bridge?.registerPluginInstance`) and turns iOS scroll
  bounce back on (Capacitor sets `bounces = false`).
- Haptics: `utils/haptics.ts` (`haptic`, `hapticAlert`, `prepareHaptic`) → `AppHapticsPlugin.swift`, which plays
  taps through **Core Haptics** (`CHHapticEngine`, fallback `AudioServicesPlaySystemSound(1519)`).
  `UIImpactFeedbackGenerator` (what @capacitor/haptics uses, removed) was accepted but silent in this app on iOS 27.
  Logs `[AppHaptics]` to the Xcode console.
- Rest timer: `native/rest.ts` (`useNativeRestTimer`, mounted in Layout) mirrors the open workout's rest to a Live
  Activity (`RestActivityPlugin.swift`; drawn by the `ios/App/RestTimerWidget` extension;
  `ios/App/Shared/RestActivityAttributes.swift` is in both targets), schedules a local "Rest over" notification
  (independently, so one failing can't block the other) and plays `hapticAlert()` if the app is open.
- Google sign-in: Google blocks its web sign-in inside apps, so `auth/session.ts` uses the native sheet
  (`@capgo/capacitor-social-login`) → `signInWithCredential`. Needs `VITE_GOOGLE_IOS_CLIENT_ID` and
  `VITE_GOOGLE_WEB_CLIENT_ID` in `.env.local` (already set); `scripts/ios-google-scheme.mjs` writes the return URL
  scheme into Info.plist. Auth uses `initializeAuth` with IndexedDB persistence (getAuth's popup/redirect iframe
  hangs in the web view).
- Status bar style follows the theme (`@capacitor/status-bar`). Share links use `SITE_URL`, not the page origin
  (`capacitor://localhost`). Info.plist has local-network keys for live reload and `ITSAppUsesNonExemptEncryption`
  false.

**Project tooling.** `scripts/ios-setup-project.rb` (xcodeproj gem; run with `GEM_HOME=$HOME/.gem/ruby/2.6.0 ruby …`)
adds the app's own Swift files and the widget target to the Xcode project; add new app Swift files to its list and
re-run it (idempotent). `scripts/ios-assets.mjs` (run by `npm run icons`) writes the app icon and a plain dark launch
screen. The icon (`public/app-icon.svg`, drawn at 1024 units; `favicon.svg` is the same in a circle) is a coral hex
dumbbell, each face one solid shade (no gradients or edge lines), its ends turned slightly towards the viewer, on a
plain dark tile with a flat bar (a coral glow behind it, a shiny bar and lines between faces were too much). No simulator runtime is installed on this Mac, so compile-check (after `npm run build && npx cap sync ios`)
and leave real testing to the user's phone:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO -quiet
```

**Judging animation from screen recordings.** The user sends iPhone screen recordings (often alongside Apple's Health
app as the reference). iOS writes a frame only when the screen changes, so gaps between frame timestamps longer than
~17 ms are freezes. Measure per-frame sideways motion of a horizontal band (ffmpeg crop + scale to one row, then find
the best shift between frames) for the page and, separately, the tab bar; that found the swipe stutters that frames
alone didn't show.
