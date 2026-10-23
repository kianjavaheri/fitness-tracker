import { DEFAULT_REPS, DEFAULT_SETS } from '../config';
import { newId, now } from '../core/ids';
import type { ParsedWorkout } from '../core/importParser';
import { findContaining, findEquivalent, findSimilar } from '../core/similarity';
import type { Exercise, ID, Routine, Session, WeightUnit, Workout } from '../core/types';
import { parseWeightInput } from '../core/units';
import { repo } from '.';
import { adoptCatalogExercise, type CatalogExercise } from './catalog';

// Turns parsed text into an editable "draft" for the import review screen, and saves it.

export type MatchChoice =
  | { kind: 'existing'; exerciseId: ID; name: string }
  | { kind: 'library'; catalogId: string; name: string }
  | { kind: 'new'; name: string };

/** Things the user must confirm before saving. */
export type ExerciseFlag =
  | 'reps' // only one rep count in the note: probably what they did, not their target range
  | 'missing' // no sets × reps on the line
  | 'weight' // "70/140" or "45+10+10": which total?
  | 'match' // not sure which exercise this is
  | 'alternative'; // "X … or" followed by Y

export interface DraftExercise {
  key: string;
  raw: string;
  /** The exercise name as written in the notes. */
  sourceName: string;
  include: boolean;
  match: MatchChoice;
  /** Candidates offered when the match is unsure (always ends with a "new exercise" option). */
  matchOptions: MatchChoice[];
  sets: number;
  /** Target rep range for the workout template. */
  reps: string;
  /** Rep count from the note (what was done last time), used for the optional history entry. */
  loggedReps: number | null;
  /** Whether the line had sets × reps at all; lines without numbers never become history. */
  hadNumbers: boolean;
  /** Weight in the user's display unit, as text for the input. */
  weight: string;
  weightText: string | null;
  note: string;
  flags: ExerciseFlag[];
  /** Shared by the two lines of an "X or / Y" pair. */
  alternativeGroup: string | null;
}

export interface DraftWorkout {
  key: string;
  name: string;
  include: boolean;
  /** Existing workout with the same name, if any. */
  existingId: ID | null;
  /** What to do when it already exists; null until the user chooses. */
  onExisting: 'update' | 'new' | null;
  exercises: DraftExercise[];
}

function matchExercise(name: string, own: Exercise[], catalog: CatalogExercise[]) {
  const active = own.filter((e) => !e.archived);
  const lower = name.toLowerCase();
  const asExisting = (e: Exercise): MatchChoice => ({ kind: 'existing', exerciseId: e.id, name: e.name });
  const asLibrary = (c: CatalogExercise): MatchChoice => {
    const owned = active.find((e) => e.catalogId === c.id);
    return owned ? asExisting(owned) : { kind: 'library', catalogId: c.id, name: c.name };
  };

  // Confident: same name, or the same words (order/plurals/abbreviations aside).
  const sure = active.find((e) => e.name.toLowerCase() === lower) ?? findEquivalent(name, active)[0];
  if (sure) return { match: asExisting(sure), options: [], sure: true };
  const libSure = findEquivalent(name, catalog)[0];
  if (libSure) return { match: asLibrary(libSure), options: [], sure: true };

  // Unsure: offer close candidates, yours first.
  const candidates: MatchChoice[] = [];
  const seen = new Set<string>();
  const add = (m: MatchChoice) => {
    const k = m.kind === 'existing' ? m.exerciseId : m.kind === 'library' ? m.catalogId : m.name;
    if (!seen.has(k)) {
      seen.add(k);
      candidates.push(m);
    }
  };
  [...findSimilar(name, active, 2), ...findContaining(name, active, 2)].forEach((e) => add(asExisting(e)));
  [...findSimilar(name, catalog, 3), ...findContaining(name, catalog, 2)].forEach((c) => add(asLibrary(c)));

  const fresh: MatchChoice = { kind: 'new', name };
  if (candidates.length === 0) return { match: fresh, options: [], sure: true };
  const options = [...candidates.slice(0, 4), fresh];
  return { match: options[0], options, sure: false };
}

export function buildImportDraft(parsed: ParsedWorkout[], own: Exercise[], catalog: CatalogExercise[], workouts: Workout[]): DraftWorkout[] {
  return parsed.map((pw) => {
    const existing = workouts.find((w) => w.name.trim().toLowerCase() === pw.name.trim().toLowerCase());
    const exercises: DraftExercise[] = pw.exercises.map((pe) => {
      const { match, options, sure } = matchExercise(pe.name, own, catalog);
      const flags: ExerciseFlag[] = [];
      if (!sure) flags.push('match');

      let reps = DEFAULT_REPS;
      let loggedReps: number | null = null;
      if (!pe.reps || pe.sets == null) {
        flags.push('missing');
      } else if (pe.reps.min !== pe.reps.max) {
        reps = `${pe.reps.min}-${pe.reps.max}`;
      } else {
        loggedReps = pe.reps.min;
        flags.push('reps');
      }

      let weight = '';
      if (pe.weights.length === 1) weight = String(pe.weights[0]);
      else if (pe.weights.length > 1) {
        // "a/b" usually means two machines or two attempts → first; "a+b+c" → total.
        weight = String(pe.weightText!.includes('+') ? pe.weights.reduce((s, n) => s + n, 0) : pe.weights[0]);
        flags.push('weight');
      }

      return {
        key: newId(),
        raw: pe.raw,
        sourceName: pe.name,
        include: true,
        match,
        matchOptions: options,
        sets: pe.sets ?? DEFAULT_SETS,
        reps,
        loggedReps,
        hadNumbers: pe.reps != null && pe.sets != null,
        weight,
        weightText: pe.weightText,
        note: pe.note ?? '',
        flags,
        alternativeGroup: null,
      };
    });

    // Pair "X … or" with the line after it.
    pw.exercises.forEach((pe, i) => {
      if (!pe.orNext || !exercises[i + 1]) return;
      const group = newId();
      for (const ex of [exercises[i], exercises[i + 1]]) {
        ex.alternativeGroup = group;
        if (!ex.flags.includes('alternative')) ex.flags.push('alternative');
      }
    });

    return { key: newId(), name: pw.name, include: true, existingId: existing?.id ?? null, onExisting: null, exercises };
  });
}

/** Included exercises still asking for a target rep range. */
export function openRepFlags(drafts: DraftWorkout[]) {
  return drafts.filter((w) => w.include).flatMap((w) => w.exercises.filter((e) => e.include && e.flags.includes('reps')));
}

/**
 * Unresolved items across the whole import. A workout that already exists counts as one;
 * all open rep-range questions count as one, since they're answered together.
 */
export function countOpenFlags(drafts: DraftWorkout[]) {
  let n = openRepFlags(drafts).length > 0 ? 1 : 0;
  for (const w of drafts) {
    if (!w.include) continue;
    if (w.existingId && !w.onExisting) n++;
    for (const e of w.exercises) {
      if (e.include || e.flags.includes('alternative')) n += e.flags.filter((f) => f !== 'reps').length;
    }
  }
  return n;
}

export type RoutineChoice = { kind: 'none' } | { kind: 'new'; name: string } | { kind: 'existing'; id: ID };

interface SaveOptions {
  routine: RoutineChoice;
  /** Also log the weights/reps from the notes as a past session, so "Previous" is filled in. */
  saveAsHistory: boolean;
  unit: WeightUnit;
  catalog: CatalogExercise[];
}

/** Writes the confirmed import. Returns the number of workouts saved. */
export async function saveImport(drafts: DraftWorkout[], opts: SaveOptions): Promise<number> {
  const exercisesNow = await repo.listExercises();
  const created = new Map<string, ID>(); // new-exercise name → id, so a name used twice is created once
  const ts = now();

  const resolve = async (d: DraftExercise): Promise<ID> => {
    const m = d.match;
    if (m.kind === 'existing') return m.exerciseId;
    if (m.kind === 'library') {
      const entry = opts.catalog.find((c) => c.id === m.catalogId);
      if (entry) {
        const ex = await adoptCatalogExercise(entry, exercisesNow);
        exercisesNow.push(ex);
        return ex.id;
      }
    }
    const key = m.name.trim().toLowerCase();
    const known = created.get(key);
    if (known) return known;
    const exercise: Exercise = {
      id: newId(),
      name: m.name.trim(),
      kind: d.weight.trim() ? 'weighted' : 'bodyweight',
      createdAt: ts,
      updatedAt: ts,
    };
    await repo.saveExercise(exercise);
    exercisesNow.push(exercise);
    created.set(key, exercise.id);
    return exercise.id;
  };

  const savedWorkoutIds: ID[] = [];
  for (const dw of drafts) {
    if (!dw.include) continue;
    const rows = dw.exercises.filter((e) => e.include);
    if (rows.length === 0) continue;

    const ids: ID[] = [];
    for (const r of rows) ids.push(await resolve(r));

    const slots = rows.map((r, i) => ({
      id: newId(),
      exerciseId: ids[i],
      targetSets: r.sets,
      targetReps: r.reps.trim() || DEFAULT_REPS,
      notes: r.note.trim() || undefined,
    }));

    let workout: Workout;
    const existing = dw.existingId && dw.onExisting === 'update' ? await repo.getWorkout(dw.existingId) : undefined;
    if (existing) {
      workout = { ...existing, exercises: slots, updatedAt: ts };
    } else {
      workout = { id: newId(), name: dw.name.trim() || 'Imported workout', exercises: slots, createdAt: ts, updatedAt: ts };
    }
    await repo.saveWorkout(workout);
    savedWorkoutIds.push(workout.id);

    if (opts.saveAsHistory) {
      const entries = rows
        .map((r, i) => {
          if (!r.hadNumbers) return null;
          // A single number in the notes is what was done; for a range, assume its low end.
          const reps = r.loggedReps ?? parseInt(r.reps, 10);
          if (!Number.isFinite(reps) || reps <= 0) return null;
          const weightKg = parseWeightInput(r.weight, opts.unit);
          return {
            id: newId(),
            exerciseId: ids[i],
            sets: Array.from({ length: r.sets }, () => ({ id: newId(), reps, weightKg, done: true })),
          };
        })
        .filter((e) => e != null);
      if (entries.length) {
        const session: Session = {
          id: newId(),
          name: workout.name,
          workoutId: workout.id,
          routineId: null,
          startedAt: ts,
          finishedAt: ts,
          live: false,
          entries,
          notes: 'Imported from notes',
        };
        await repo.saveSession(session);
      }
    }
  }

  if (opts.routine.kind === 'new' && savedWorkoutIds.length) {
    const routine: Routine = { id: newId(), name: opts.routine.name.trim() || 'My split', workoutIds: savedWorkoutIds, createdAt: ts, updatedAt: ts };
    await repo.saveRoutine(routine);
  } else if (opts.routine.kind === 'existing') {
    const r = await repo.getRoutine(opts.routine.id);
    if (r) {
      const add = savedWorkoutIds.filter((id) => !r.workoutIds.includes(id));
      await repo.saveRoutine({ ...r, workoutIds: [...r.workoutIds, ...add], updatedAt: ts });
    }
  }

  return savedWorkoutIds.length;
}
