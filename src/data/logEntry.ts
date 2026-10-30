import { newId } from '../core/ids';
import type { ID, Session, SessionEntry } from '../core/types';
import { repo } from '.';

export interface LoggedNumbers {
  /** Each set's numbers; weight is null only for bodyweight exercises (no added weight). */
  sets: { reps: number; weightKg: number | null }[];
  /** Typed per side of the bar: carried to the next session of this workout (`SessionEntry.perSide`). */
  perSide: boolean;
  /** The local day done ("YYYY-MM-DD"), or null if not known. */
  date: string | null;
}

/** Takes an exercise's numbers out of a Log-only record, and the record with them if nothing's left in it. */
async function removeFrom(session: Session, exerciseId: ID, occurrence: number) {
  let seen = -1;
  const single = session.entries.filter((e) => e.exerciseId === exerciseId).length === 1;
  const entries = session.entries.filter((e) => e.exerciseId !== exerciseId || (!single && ++seen !== occurrence));
  if (entries.some((e) => e.sets.length > 0)) await repo.saveSession({ ...session, entries });
  else await repo.deleteSession(session.id);
}

interface SaveArgs {
  exerciseId: ID;
  workout: { id: ID; name: string };
  /** Which appearance, for an exercise in the workout twice (0 otherwise). */
  occurrence: number;
  numbers: LoggedNumbers;
  /** The Log-only record these numbers replace, when changing them. */
  replacing?: ID;
}

/**
 * Saves numbers typed into the Log for an exercise. They're a Log-only record (`imported`, plus `dated` if a date was
 * given), never a workout: they fill the Log, Last and the placeholders, and no list of workouts, activity or chart
 * shows them. Real workouts are never touched. Resolves to an Undo that puts back exactly what changed.
 */
export async function saveLoggedNumbers({ exerciseId, workout, occurrence, numbers, replacing }: SaveArgs): Promise<() => Promise<void>> {
  const sessions = await repo.listSessions();
  const old = replacing ? sessions.find((s) => s.id === replacing) : undefined;
  if (old) await removeFrom(old, exerciseId, occurrence);
  const others = sessions.filter((s) => s.id !== old?.id);

  const entry: SessionEntry = {
    id: newId(),
    exerciseId,
    ...(numbers.perSide ? { perSide: true } : {}),
    sets: numbers.sets.map((s) => ({ id: newId(), reps: s.reps, weightKg: s.weightKg, done: true })),
  };
  // An exercise in the workout twice is told apart by position: empty entries hold the earlier appearances' places.
  const entries: SessionEntry[] = [...Array.from({ length: occurrence }, () => ({ id: newId(), exerciseId, sets: [] })), entry];

  let at: string;
  if (numbers.date) {
    const [y, m, d] = numbers.date.split('-').map(Number);
    at = new Date(y, m - 1, d, 12).toISOString();
  } else {
    // A placeholder before everything else; only ever shown as "No date".
    const earliest = others.reduce<string | null>((min, s) => (!min || s.startedAt < min ? s.startedAt : min), null);
    at = earliest ? new Date(Date.parse(earliest) - 86_400_000).toISOString() : new Date().toISOString();
  }
  const session: Session = {
    id: newId(),
    name: workout.name,
    workoutId: workout.id,
    routineId: null,
    startedAt: at,
    finishedAt: at,
    live: false,
    imported: true,
    ...(numbers.date ? { dated: true } : {}),
    entries,
  };
  await repo.saveSession(session);

  return async () => {
    await repo.deleteSession(session.id);
    if (old) await repo.saveSession(old);
  };
}

/** Removes an exercise's Log-only numbers. Resolves to an Undo. */
export async function removeLoggedNumbers(sessionId: ID, exerciseId: ID, occurrence: number): Promise<() => Promise<void>> {
  const old = (await repo.listSessions()).find((s) => s.id === sessionId);
  if (!old) return async () => {};
  await removeFrom(old, exerciseId, occurrence);
  return async () => {
    await repo.saveSession(old);
  };
}
