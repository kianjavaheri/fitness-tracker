# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal workout tracker (React 19 + TypeScript + Vite). Meant to replace a notes app for logging lifts: plan
workouts/routines, check in to log sets, view progress charts. Web today; built to be wrapped with Capacitor later.

## Commands

```bash
npm run dev            # http://localhost:5173 (sign-in required if .env.local has Firebase config, else local-only)
npm run build          # tsc -b && vite build — the type check is part of the build
npx tsc -b             # type check only
npm run lint           # oxlint (.oxlintrc.json)
npm run emulators      # Firebase auth :9099 + Firestore :8080 + UI :4000 (needs Java)
npm run dev:emulator   # app wired to the emulators via .env.emulator (demo project, no real Firebase)
node scripts/build-exercise-catalog.mjs <exercises.json>   # regenerate src/data/exerciseCatalog.json
```

There is no test suite. Verify changes in the browser; in dev, **Settings → Load demo data** (or importing
`src/data/demo.ts` and calling `repo.importSnapshot(demoSnapshot())`) gives ~10 weeks of history to look at.
`.claude/launch.json` has `web`, `firebase-emulators` and `web-emulator` configs.

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
closes, every queued write is also journaled synchronously to `localStorage` (`fitness-tracker:pending-writes:<uid>`)
and replayed on the next start until Firestore confirms it.

**Reactivity.** No state library. `useRepoQuery(fn)` re-runs a repository read whenever the repo emits a change.
Editor pages use `useEditable(load, save)`: loads a record once into local state and persists on every change, so
inputs never fight async reloads. If you add a page that both edits a record and also writes it directly (e.g.
finish/delete), write through the same `update` or be aware the draft won't reload.

**Sign-in is required when Firebase is configured** (`.env.local` has `VITE_FIREBASE_*`). `AuthProvider` gates the
whole app: blank → `Splash` (only if restoring takes >400 ms) → `LoginScreen` when signed out, else the app. The gate
sits above the router, so the requested URL survives sign-in. Returning users are restored automatically from Firebase
Auth's IndexedDB persistence. Sign-out (avatar menu or Settings) flushes queued writes, waits up to 4 s for Firestore
to confirm them (asks before discarding if offline), then `signOutAndClear()` signs out, terminates Firestore, clears
its offline cache and reloads to `/`. Without Firebase config, `useAuth().status === 'disabled'`: no gate, local-only
data — handy for UI work.

**Firebase is lazy.** `auth/config.ts` reads the env vars and must not import the SDK. All SDK usage lives in
`auth/session.ts` + `auth/firebaseServices.ts` + `data/cloudRepository.ts`, reached only through a dynamic
`import('./session')` — keep it that way so the SDK (~190 KB gzip) stays out of the main bundle. Rules:
`firestore.rules`.
To exercise sign-in against the emulators from a script, `signInWithCredential(auth,
GoogleAuthProvider.credential(JSON.stringify({ sub, email, name })))` works with unsigned fake tokens.

## Domain rules that aren't obvious

- **Weights are stored in kg** (`SetLog.weightKg`) and converted only at the UI edge (`core/units.ts`); default
  display unit is lb.
- **A set counts once it has reps > 0** (`isCompletedSet`) — the ✓ "done" flag is a logging convenience, not the
  source of truth. `finalizeSession` drops sets without reps and exercises left empty.
- A **Session** with `finishedAt === null` is in progress; `live === false` means logged after the fact (no timer or
  duration; `finishedAt` is set to `startedAt`).
- **Routines** hold ordered `workoutIds` plus optional `days[workoutId]` (0 = Sun). "Up next" (`nextWorkoutInRoutine`)
  returns a workout planned for today, else the one after the last done from that routine, else **null** — never
  guess when there's no basis.
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
  answered together. Optionally the noted weights are saved as a past session so "Previous" is filled in.
- Defaults for new exercise slots live in `src/config.ts` (`DEFAULT_SETS = 2`, `DEFAULT_REPS = '6-12'`).

## Naming / routes (user-facing names differ from early code names)

- Nav: **Home | Workouts | Analytics | Edit workouts**, then the avatar account menu (Settings, Sign out) — or a
  gear icon in local-only mode — and the Light/Dark toggle.
- "Workouts" = logged sessions → `/workouts` → `pages/WorkoutLogPage.tsx`.
- "Edit workouts" = templates, routines, exercise list, import → `/edit`, `/edit/workouts/:id`, `/edit/routines/:id`,
  `/edit/exercises`, `/edit/import` → `EditWorkoutsPage`, `WorkoutEditorPage`, `RoutineEditorPage`, `ExercisesPage`,
  `ImportPage`.
- A logged session is `/session/:id`; check-in is `/check-in`. Use "Cancel workout" (not "Stop") for discarding an
  in-progress session — `components/CancelWorkoutButton.tsx` uses an in-app dialog, not `confirm()`.
- Editor pages accept `?from=<path>` so Save returns to where the user came from (e.g. back to a routine).

## Styling

- All styling is in `src/index.css` with CSS custom-property tokens; light on `:root`, dark on
  `[data-theme='dark']` (set by `hooks/settings.tsx`). Look and feel mirrors kianjavaheri.com: Google Sans Flex,
  gradient cards, full-width glass navbar, uppercase underlined CTAs; Antigravity-style round icon "orbs" on Home.
- Dark mode uses neutral Claude-app grays (`#191919` base, ~`#2f2f2f` cards). `--accent` is coral (`#f28b82` dark /
  `#c9473c` light) for badges, focus rings, highlights and the Check in orb; `--danger` is a deliberately different
  saturated red. Charts do **not** use `--accent`: their colors are in `components/chartTheme.ts` (blue single-series
  accent and a fixed-order 8-color categorical palette validated for colour-blind separation — don't cycle or
  reorder; >8 series must be capped).
- Home's 6-month activity grid is deliberately two-state (rest gray / trained blue): you train at most once a day,
  and set counts mostly reflect which workout it was, so shading by volume was confusing. Don't reintroduce a ramp
  without labelling what it encodes.
- Navbar spans the full width (`.nav-inner`, slim `clamp()` gutter) while page content stays max 1200px; the signed-in
  avatar is 34px with extra spacing around it and the theme toggle.
- The user prefers compact sizing (13px nav, 15px base, 36px buttons) and plain, personal copy — no marketing
  taglines or branding. Check layouts at phone widths: breakpoints are 480/560/820/900/980px; on ≤560px the main
  panel goes edge-to-edge and the hub is a single row.
