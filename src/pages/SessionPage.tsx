import { ArrowDown, ArrowLeft, ArrowUp, ChartLine, Check, Play, Plus, Repeat, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CancelWorkoutButton } from '../components/CancelWorkoutButton';
import { DateTimeFields } from '../components/DateTimeFields';
import { ExercisePicker } from '../components/ExercisePicker';
import { ExerciseRest } from '../components/ExerciseRest';
import { useFeedback } from '../components/Feedback';
import { DEFAULT_SETS } from '../config';
import { NotFound } from '../components/NotFound';
import { ExerciseNotepad, NotesButton, WorkoutNotepad } from '../components/Notes';
import { NumericInput } from '../components/NumericInput';
import { ExercisePrevious, PreviousButton, WorkoutPrevious } from '../components/PreviousLog';
import { formatRest, RestTimer } from '../components/RestTimer';
import { SetMenu } from '../components/SetMenu';
import { SupersetButton, SupersetPill, usePills } from '../components/SupersetLink';
import { PageSkeleton } from '../components/Skeleton';
import { formatDuration, relativeDay } from '../core/format';
import { now } from '../core/ids';
import { hasNotesOrLinks } from '../core/links';
import { canResume, emptySet, entryFinishedAt, finalizeSession, isEntryDone, isImportedSession, newEntry, orderByStarted, resumeSession, sessionDurationMinutes } from '../core/sessions';
import { exerciseLog, exercisesLog, isCompletedSet, lastPerformance, lastPerformanceWithDate, sessionSummary, type PastPerformance } from '../core/stats';
import { groupBounds, leaveSuperset, moveIntoSuperset, moveUnlinked, placeAfter, removeUnlinked, restoreLinks, restsAfter, supersetGroups, supersetWith } from '../core/supersets';
import { DEFAULT_REST_SECONDS, restSecondsFor, type Exercise, type Session, type SessionEntry, type SetLog, type WeightUnit } from '../core/types';
import { isBarbellExercise, platesLabel } from '../core/plates';
import { suggestedWeightKg } from '../core/progression';
import { formatWeight, parseWeightInput } from '../core/units';
import { repo } from '../data';
import { removeFromAppleHealth, saveToAppleHealth, syncToAppleHealth } from '../native/health';
import { useSettings } from '../hooks/settings';
import { useDragReorder } from '../hooks/useDragReorder';
import { useSlotFlip } from '../hooks/useSlotFlip';
import { ExercisePhotos, ExerciseThumb, hasMedia } from '../components/ExercisePhoto';
import { useExerciseMedia } from '../hooks/useCatalog';
import { useEditable } from '../hooks/useEditable';
import { useExercises, useSessions, useWorkouts } from '../hooks/useRepo';
import { useWakeLock } from '../hooks/useWakeLock';
import { canGoBack } from '../utils/history';

type Picking = { mode: 'add' } | { mode: 'swap'; entryId: string } | null;

export function SessionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const exercises = useExercises();
  const sessions = useSessions();
  const workouts = useWorkouts();
  const [picking, setPicking] = useState<Picking>(null);
  // While logging, an exercise's Superset pill shows only once its link button is tapped.
  const pills = usePills(false);
  /** The exercise whose Superset pill was tapped: search for one to superset with it. */
  const [supersetFor, setSupersetFor] = useState<string | null>(null);
  /** Slides exercises to their new places when they go into or out of a superset. */
  const flip = useSlotFlip();
  /**
   * Where an exercise pulled into a superset came from (the id of the one before it, null if first), so taking it out
   * puts it back there. Forgotten once it's moved by hand.
   */
  const origins = useRef(new Map<string, string | null>());
  const rememberOrigin = (entries: SessionEntry[], index: number) => {
    const id = entries[index]?.id;
    if (id && !origins.current.has(id)) origins.current.set(id, entries[index - 1]?.id ?? null);
  };
  /** The "Previous" window open: an exercise's (its id) or the whole workout's. */
  const [previous, setPrevious] = useState<{ exerciseId: string } | 'workout' | null>(null);
  const { notify } = useFeedback();
  const [workoutNotesOpen, setWorkoutNotesOpen] = useState(false);
  const finishing = useRef(false);

  // Every change stamps lastActivityAt, which is how a workout left open by mistake is spotted.
  const [session, update] = useEditable<Session>(() => repo.getSession(id), (s) => repo.saveSession({ ...s, lastActivityAt: now() }), [id]);
  // Keep the screen on while logging live, so the phone doesn't lock between sets.
  useWakeLock(!!session && !session.finishedAt && session.live !== false);
  // Hold an exercise's name and drag it to change the order, or drop it on a Superset pill to link it there.
  const reorder = useDragReorder(
    session?.entries.length ?? 0,
    (from, to) => {
      const id = session?.entries[from]?.id;
      if (id) origins.current.delete(id);
      update((s) => ({ ...s, entries: moveUnlinked(s.entries, from, to) }));
    },
    (from, host) => {
      if (session) rememberOrigin(session.entries, from);
      flip();
      update((s) => ({ ...s, entries: moveIntoSuperset(s.entries, from, host) }));
    },
  );

  if (session === undefined) return <PageSkeleton />;
  if (session === null) return <NotFound />;

  const exerciseById = new Map(exercises?.map((e) => [e.id, e]));
  const inProgress = !session.finishedAt;
  const live = session.live !== false;
  const summary = sessionSummary(session);
  const duration = sessionDurationMinutes(session);
  // Start and Again on the bar reuse the last rest's length (the exercise's own), else the default.
  const barRest = session.restLength || settings.restSeconds || DEFAULT_REST_SECONDS;
  const restAt = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
  // Rest only applies while logging live; it's saved on the session so it survives reopening the app. Each exercise
  // can have its own length (`restSecondsFor`).
  const restOn = settings.restTimer !== false;
  const startRest = (exerciseId: string) => {
    if (!restOn) return;
    const seconds = restSecondsFor(exerciseById.get(exerciseId), settings);
    if (inProgress && live && seconds > 0 && !session.restHidden) update((s) => ({ ...s, restEndsAt: restAt(seconds), restLength: seconds }));
  };
  const template = workouts?.find((w) => w.id === session.workoutId);
  /** Changes to a finished workout's name, date or duration also reach its copy in Apple Health. */
  const updateShown = (fn: (s: Session) => Session) =>
    update((s) => {
      const next = fn(s);
      if (next.finishedAt) syncToAppleHealth(next);
      return next;
    });

  const updateEntry = (entryId: string, fn: (e: SessionEntry) => SessionEntry) =>
    update((s) => ({ ...s, entries: s.entries.map((e) => (e.id === entryId ? fn(e) : e)) }));

  /** The link button: takes an exercise out of its superset (with Undo), or shows / hides its Superset pill. */
  const toggleSuperset = (entry: SessionEntry) => {
    const index = session.entries.findIndex((e) => e.id === entry.id);
    const [start, end] = groupBounds(session.entries, index);
    if (start === end) return pills.toggle(entry.id);
    const before = session.entries.map((e) => ({ id: e.id, supersetNext: e.supersetNext }));
    // Back to where it was before it was pulled in, if we know (it slides there).
    const origin = origins.current.get(entry.id);
    origins.current.delete(entry.id);
    flip();
    update((s) => {
      const out = leaveSuperset(s.entries, s.entries.findIndex((e) => e.id === entry.id));
      return { ...s, entries: origin === undefined ? out : placeAfter(out, out.findIndex((e) => e.id === entry.id), origin) };
    });
    notify('Superset removed', {
      undo: () => {
        flip();
        update((s) => ({ ...s, entries: restoreLinks(s.entries, before) }));
      },
    });
  };

  /** Supersets the exercise whose pill was tapped with one picked from search (added to this workout if needed). */
  const supersetWithPicked = (hostId: string, exerciseId: string) => {
    const host = session.entries.findIndex((e) => e.id === hostId);
    const occurrence = session.entries.filter((e) => e.exerciseId === exerciseId).length;
    const prevCount = sessions ? lastPerformance(exerciseId, sessions, { excludeSessionId: session.id, before: session.startedAt, occurrence }).length : 0;
    // An exercise already in the workout moves up next to this one: remember where it was.
    const [start, end] = groupBounds(session.entries, host);
    const existing = session.entries.findIndex((e, i) => e.exerciseId === exerciseId && (i < start || i > end));
    if (existing >= 0) rememberOrigin(session.entries, existing);
    flip();
    const entries = supersetWith(session.entries, host, exerciseId, () => newEntry(exerciseId, prevCount || DEFAULT_SETS));
    update((s) => ({ ...s, entries }));
    // The pill moves to under the superset's last exercise, ready for another.
    const [, last] = groupBounds(entries, entries.findIndex((e) => e.id === hostId));
    pills.hide(hostId);
    pills.show(entries[last].id);
  };

  const finish = async () => {
    // A second tap while the first is saving would save it (and add it to Health) twice.
    if (finishing.current) return;
    if (summary.sets === 0) {
      notify('Nothing is logged yet. Fill in a set, or use Cancel workout to discard it.');
      return;
    }
    finishing.current = true;
    const finished = finalizeSession(session);
    try {
      await repo.saveSession(finished);
    } finally {
      finishing.current = false;
    }
    saveToAppleHealth(finished);
    // Home, where it now shows under Recent workouts.
    navigate('/');
  };

  // Deletes at once and offers Undo instead of asking first.
  const deleteFinished = async () => {
    const deleted = session;
    await repo.deleteSession(deleted.id);
    removeFromAppleHealth(deleted.id);
    navigate('/history', { replace: true });
    notify(`Deleted “${deleted.name}”`, {
      undo: () => {
        void repo.saveSession(deleted);
        saveToAppleHealth(deleted);
      },
    });
  };

  return (
    <div className="narrow">
      <div className="spread" style={{ marginBottom: 14 }}>
        {/* Back to wherever this was opened from (heatmap, Analytics, history…), else a sensible default. */}
        {canGoBack() ? (
          <button className="back-link" style={{ margin: 0 }} onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> Back
          </button>
        ) : (
          <Link to={inProgress ? '/' : '/history'} className="back-link" style={{ margin: 0 }}>
            <ArrowLeft size={15} /> {inProgress ? 'Home' : 'History'}
          </Link>
        )}
        {inProgress && (
          // Back to Check in, where it was started from (replacing the page of the deleted workout in history).
          <CancelWorkoutButton
            session={session}
            onCancelled={() => navigate('/check-in', { replace: true })}
            onRestore={(restored) => update(() => restored)}
          />
        )}
        {sessions && canResume(session, sessions) && (
          <button className="btn btn-sm" onClick={() => update(resumeSession)} title="Pick this workout back up; the timer continues from when it started">
            <Play size={14} /> Resume
          </button>
        )}
      </div>

      {/* Pinned under Back while logging live; idle until a set is checked off. */}
      {inProgress && live && restOn && (
        <RestTimer
          endsAt={session.restEndsAt ?? null}
          hidden={!!session.restHidden}
          startLabel={formatRest(barRest)}
          onStart={() => update((s) => ({ ...s, restEndsAt: restAt(barRest) }))}
          onStop={() => update((s) => ({ ...s, restEndsAt: null }))}
          onHide={() => update((s) => ({ ...s, restHidden: true, restEndsAt: null }))}
          onShow={() => update((s) => ({ ...s, restHidden: false }))}
          onAdjust={(seconds) =>
            update((s) => ({ ...s, restEndsAt: s.restEndsAt ? new Date(Math.max(Date.now(), Date.parse(s.restEndsAt)) + seconds * 1000).toISOString() : null }))
          }
        />
      )}

      {/* The date and time are in the fields below when they matter; a live workout's time so far is in the bottom bar. */}
      <div className="row" style={{ gap: 6 }}>
        <input
          className="title-input session-name"
          value={session.name}
          onChange={(e) => updateShown((s) => ({ ...s, name: e.target.value }))}
          onBlur={() => !session.name.trim() && updateShown((s) => ({ ...s, name: 'Workout' }))}
          aria-label="Session name"
        />
        {inProgress ? <span className="badge session-state">{live ? '● Live' : 'Logging'}</span> : <span className="chip small session-state">{isImportedSession(session) ? 'From notes' : 'Done'}</span>}
        <span className="session-head-gap" />
        {template && (
          <NotesButton
            label={`Notes for ${template.name}`}
            hasNotes={!!template.notes?.trim()}
            open={workoutNotesOpen}
            onClick={() => setWorkoutNotesOpen(!workoutNotesOpen)}
          />
        )}
        <PreviousButton label={`Last times: ${session.name}`} onClick={() => setPrevious('workout')} />
      </div>
      {template && workoutNotesOpen && <WorkoutNotepad key={template.id} workout={template} />}
      {(!live || !inProgress) && (
        <div style={{ marginTop: 12 }}>
          <DateTimeFields
            value={session.startedAt}
            onChange={(startedAt) => {
              const shift = Date.parse(startedAt) - Date.parse(session.startedAt);
              updateShown((s) => ({
                ...s,
                startedAt,
                finishedAt: s.finishedAt ? new Date(Date.parse(s.finishedAt) + shift).toISOString() : null,
              }));
            }}
          />
          {!inProgress && (
            <div className="row-wrap" style={{ gap: 10, alignItems: 'flex-start', marginTop: 10 }}>
              <label className="duration-field">
                <span className="label">Duration</span>
                <div className="affix">
                  <NumericInput
                    className="input tnum"
                    ariaLabel="Duration in minutes"
                    value={sessionDurationMinutes(session)}
                    placeholder="—"
                    format={(v) => (v == null ? '' : String(v))}
                    parse={(t) => (t ? parseInt(t, 10) : null)}
                    // Empty clears it on purpose (null), so a back-dated live session stops showing its timer.
                    onChange={(minutes) => updateShown((s) => ({ ...s, durationMinutes: minutes }))}
                  />
                  <span className="suffix">min</span>
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      <div className="stack" style={{ marginTop: 22, gap: 12 }}>
        {session.entries.length === 0 && (
          <div className="empty">
            Nothing logged yet.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setPicking({ mode: 'add' })}>
                <Plus size={15} /> Add exercise
              </button>
            </div>
          </div>
        )}
        {supersetGroups(session.entries).map((group) => (
          <div key={group[0].item.id} className={group.length > 1 ? 'superset' : 'stack'} style={group.length > 1 ? undefined : { gap: 12 }}>
            {group.length > 1 && (
              <div className="superset-label">
                Superset · alternate sets, rest after {exerciseById.get(group[group.length - 1].item.exerciseId)?.name ?? 'the last one'}
              </div>
            )}
            {group.map(({ item: entry, index: i }, k) => (
              // The card and the pill under it move together when reordering.
              <div key={entry.id} ref={reorder.itemRef(i)} className="slot" data-slot-id={entry.id}>
                <EntryCard
                  handle={reorder.handle(i)}
                  entry={entry}
                  exercise={exerciseById.get(entry.exerciseId)}
                  last={
                    sessions
                      ? lastPerformanceWithDate(entry.exerciseId, sessions, {
                          excludeSessionId: session.id,
                          before: session.startedAt,
                          occurrence: session.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length,
                        })
                      : null
                  }
                  unit={settings.unit}
                  isFirst={i === 0}
                  isLast={i === session.entries.length - 1}
                  onChange={(fn) => updateEntry(entry.id, fn)}
                  onMove={(dir) => update((s) => ({ ...s, entries: moveUnlinked(s.entries, i, i + dir) }))}
                  onRemove={() => {
                    // The order and links as they were, so Undo puts it back in its place and in its superset.
                    const before = session.entries.map((e) => ({ id: e.id, supersetNext: e.supersetNext }));
                    update((s) => ({ ...s, entries: removeUnlinked(s.entries, s.entries.findIndex((e) => e.id === entry.id)) }));
                    // Only worth an Undo when sets were logged; an untouched exercise is quick to add back.
                    if (entry.sets.some(isCompletedSet)) {
                      notify(`Removed ${exerciseById.get(entry.exerciseId)?.name ?? 'exercise'}`, {
                        undo: () => update((s) => ({ ...s, entries: restoreLinks([...s.entries.filter((e) => e.id !== entry.id), entry], before) })),
                      });
                    }
                  }}
                  onSwap={() => setPicking({ mode: 'swap', entryId: entry.id })}
                  onPrevious={() => setPrevious({ exerciseId: entry.exerciseId })}
                  inSuperset={group.length > 1}
                  pillShown={pills.isShown(entry.id)}
                  onSuperset={() => toggleSuperset(entry)}
                  showRest={inProgress && live && restOn}
                  onSetDone={() => {
                    if (restsAfter(session.entries, i)) startRest(entry.exerciseId);
                    // Starting an exercise (or superset) moves it up after the ones already started (orderByStarted).
                    if (!inProgress) return;
                    update((s) => {
                      const entries = orderByStarted(s.entries);
                      if (entries.every((e, k) => e.id === s.entries[k].id)) return s;
                      flip();
                      return { ...s, entries };
                    });
                  }}
                  suggestionKg={
                    inProgress && sessions && exerciseById.get(entry.exerciseId)?.kind !== 'bodyweight'
                      ? suggestedWeightKg(
                          entry.targetReps,
                          lastPerformance(entry.exerciseId, sessions, {
                            excludeSessionId: session.id,
                            before: session.startedAt,
                            occurrence: session.entries.slice(0, i).filter((e) => e.exerciseId === entry.exerciseId).length,
                          }),
                          settings.unit,
                        )
                      : null
                  }
                />
                {k === group.length - 1 && pills.isShown(entry.id) && <SupersetPill host={i} onClick={() => setSupersetFor(entry.id)} />}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sticky-bar">
        {/* Progress through the workout: exercises with every set checked, plus how long it's been going. */}
        <div className="small tnum" style={{ minWidth: 0, whiteSpace: 'nowrap' }}>
          <strong>
            {session.entries.filter(isEntryDone).length}/{session.entries.length}
          </strong>
          <span className="muted bar-unit"> exercises</span>
          {inProgress && live && (
            <>
              {' · '}
              <Elapsed since={session.startedAt} />
            </>
          )}
          {!inProgress && duration != null && ` · ${formatDuration(duration)}`}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setPicking({ mode: 'add' })}>
            <Plus size={15} /> Exercise
          </button>
          {inProgress ? (
            <button className="btn btn-primary btn-sm" onClick={finish}>
              <Check size={15} /> {live ? 'Finish' : 'Save'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => (canGoBack() ? navigate(-1) : navigate('/history'))}>
              Done
            </button>
          )}
        </div>
      </div>

      {!inProgress && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-danger btn-sm" onClick={deleteFinished}>
            <Trash2 size={14} /> Delete session
          </button>
        </div>
      )}

      {supersetFor && session.entries.some((e) => e.id === supersetFor) && (() => {
        const host = session.entries.findIndex((e) => e.id === supersetFor);
        const [start, end] = groupBounds(session.entries, host);
        const inGroup = session.entries.slice(start, end + 1).map((e) => e.exerciseId);
        return (
          <ExercisePicker
            title={`Superset ${exerciseById.get(session.entries[host].exerciseId)?.name ?? 'exercise'} with…`}
            featuredIds={session.entries.map((e) => e.exerciseId).filter((id) => !inGroup.includes(id))}
            excludeIds={inGroup}
            onClose={() => setSupersetFor(null)}
            onPick={(ex) => {
              supersetWithPicked(supersetFor, ex.id);
              setSupersetFor(null);
            }}
          />
        );
      })()}

      {previous === 'workout' && sessions && (
        <WorkoutPrevious
          name={session.name}
          log={exercisesLog(session.entries.map((e) => e.exerciseId), sessions, session.id, session.startedAt)}
          exerciseById={exerciseById}
          unit={settings.unit}
          onClose={() => setPrevious(null)}
        />
      )}
      {previous && previous !== 'workout' && sessions && exerciseById.get(previous.exerciseId) && (
        <ExercisePrevious
          exercise={exerciseById.get(previous.exerciseId)!}
          log={exerciseLog(previous.exerciseId, sessions, session.id, session.startedAt)}
          unit={settings.unit}
          onClose={() => setPrevious(null)}
        />
      )}

      {picking && (
        <ExercisePicker
          title={picking.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}
          selectedIds={session.entries.map((e) => e.exerciseId)}
          onClose={() => setPicking(null)}
          onPick={(ex) => {
            if (picking.mode === 'swap') {
              updateEntry(picking.entryId, (e) => ({ ...e, exerciseId: ex.id }));
            } else {
              const occurrence = session.entries.filter((e) => e.exerciseId === ex.id).length;
              const prevCount = sessions ? lastPerformance(ex.id, sessions, { excludeSessionId: session.id, before: session.startedAt, occurrence }).length : 0;
              update((s) => ({ ...s, entries: [...s.entries, newEntry(ex.id, prevCount || DEFAULT_SETS)] }));
            }
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

interface EntryCardProps {
  /** Hold-and-drag reordering (useDragReorder): the part that's held. */
  handle: ReturnType<ReturnType<typeof useDragReorder>['handle']>;
  entry: SessionEntry;
  exercise: Exercise | undefined;
  last: PastPerformance | null;
  unit: WeightUnit;
  isFirst: boolean;
  isLast: boolean;
  onChange: (fn: (e: SessionEntry) => SessionEntry) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSwap: () => void;
  /** Opens this exercise's "Previous" window: every earlier day's sets. */
  onPrevious: () => void;
  /** In a superset with other exercises; the button at the bottom right takes it out, or shows its Superset pill. */
  inSuperset: boolean;
  pillShown: boolean;
  onSuperset: () => void;
  /** A set was just checked off (starts the rest timer). */
  /** A set was checked off. */
  onSetDone: () => void;
  /** "Go up" weight for this workout (kg), when last time hit the top of the rep range on every set. */
  suggestionKg: number | null;
  /** Live and in progress: shows the exercise's rest length, which can be changed there. */
  showRest: boolean;
}

function EntryCard({ handle, entry, exercise, last, unit, isFirst, isLast, onChange, onMove, onRemove, onSwap, onPrevious, inSuperset, pillShown, onSuperset, onSetDone, suggestionKg, showRest }: EntryCardProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const mediaFor = useExerciseMedia();
  const media = exercise ? mediaFor(exercise) : undefined;
  const bodyweight = exercise?.kind === 'bodyweight';
  const previous = last?.sets ?? [];

  const setSet = (setId: string, patch: Partial<SetLog>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  // Working-set number per row (warm-ups don't count), which is also how rows line up with last time.
  const working = entry.sets.reduce<number[]>((acc, set) => [...acc, set.warmup ? -1 : acc.filter((n) => n >= 0).length], []);
  const label = (i: number) => (working[i] < 0 ? 'Warm-up' : String(working[i] + 1));
  const barbell = isBarbellExercise(exercise);

  /**
   * Suggested values for set i (its placeholders, and what checking it off empty fills in): what you did in the set
   * above this session, once anything's in it (11 × 10 in set 1 suggests 11 × 10 for set 2); else the same working set
   * last time. A warm-up only follows a warm-up above it, a working set a working one.
   */
  const hint = (i: number): Pick<SetLog, 'weightKg' | 'reps'> | undefined => {
    const above = entry.sets.slice(0, i).findLast((s) => !!s.warmup === !!entry.sets[i].warmup);
    const filled = above && (above.reps != null || above.weightKg != null) ? above : undefined;
    const before = working[i] < 0 ? undefined : (previous[working[i]] ?? previous.at(-1));
    if (!filled && !before) return undefined;
    return {
      weightKg: filled?.weightKg ?? before?.weightKg ?? null,
      reps: filled?.reps ?? before?.reps ?? null,
    };
  };

  const toggleDone = (set: SetLog, i: number) => {
    if (set.done) return setSet(set.id, { done: false, doneAt: undefined });
    const h = hint(i);
    const reps = set.reps ?? h?.reps ?? null;
    const weightKg = set.weightKg ?? h?.weightKg ?? null;
    if (!reps) return; // nothing to complete yet
    setSet(set.id, { done: true, reps, weightKg, doneAt: new Date().toISOString() });
    onSetDone();
  };
  const finishedAt = entryFinishedAt(entry);

  // "Go up" stays until the suggested weight is filled into every working set still to do.
  const toDo = entry.sets.filter((s) => !s.done && !s.warmup);
  const showSuggestion = suggestionKg != null && toDo.some((s) => s.weightKg !== suggestionKg);
  const applySuggestion = () =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (!s.done && !s.warmup ? { ...s, weightKg: suggestionKg } : s)) }));

  const addSet = () =>
    onChange((e) => {
      const last = e.sets.at(-1);
      return { ...e, sets: [...e.sets, { ...emptySet(), weightKg: last?.weightKg ?? null }] };
    });

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="spread" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        {exercise && media && hasMedia(media) && (
          // Library exercises have photos: tap to see how it's done.
          <button className="thumb-btn" onClick={() => setPhotosOpen(true)} aria-label={`Photos of ${exercise.name}`} title="How it's done">
            <ExerciseThumb media={media} size={44} />
          </button>
        )}
        <div className="holdable" style={{ minWidth: 0, flex: 1 }} {...handle}>
          <div className="card-title" style={{ fontSize: 16 }}>
            {exercise?.name ?? 'Unknown exercise'}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {[
              // When it was finished (sets checked off before times were kept have none).
              finishedAt ? `Done ${new Date(finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : null,
              entry.targetSets ? `Target ${entry.targetSets} × ${entry.targetReps || '—'}` : null,
              last ? `Last done ${relativeDay(last.date, true)}` : 'First time',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {showSuggestion && (
            <button className="chip go-up" onClick={applySuggestion} title="Last time every set hit the top of the range. Tap to use this weight.">
              <ArrowUp size={13} /> Go up: {formatWeight(suggestionKg, unit)} {unit}
            </button>
          )}
          {entry.notes && (
            <div className="small" style={{ marginTop: 4 }}>
              {entry.notes}
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 0, margin: '-4px -6px 0 0' }}>
          {exercise && (
            <NotesButton
              label={`Notes and links for ${exercise.name}`}
              hasNotes={hasNotesOrLinks(exercise)}
              open={notesOpen}
              onClick={() => setNotesOpen(!notesOpen)}
            />
          )}
          <Link to={`/analytics?exercise=${entry.exerciseId}`} className="icon-btn hide-mobile" aria-label="Analytics">
            <ChartLine size={15} />
          </Link>
          <button className="icon-btn" onClick={onSwap} aria-label="Swap exercise" title="Swap exercise">
            <Repeat size={15} />
          </button>
          <button className="icon-btn hide-mobile" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp size={15} />
          </button>
          <button className="icon-btn hide-mobile" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown size={15} />
          </button>
          <button className="icon-btn" onClick={onRemove} aria-label="Remove exercise">
            <X size={15} />
          </button>
        </div>
      </div>

      {exercise && (
        <div className="entry-actions">
          <PreviousButton label={`Last times: ${exercise.name}`} onClick={onPrevious} />
          {showRest && <ExerciseRest exercise={exercise} />}
        </div>
      )}

      {exercise && notesOpen && <ExerciseNotepad key={exercise.id} exercise={exercise} />}
      {photosOpen && exercise && media && <ExercisePhotos name={exercise.name} media={media} onClose={() => setPhotosOpen(false)} />}

      <div className="set-grid" style={{ marginTop: 12 }}>
        <span className="head">Set</span>
        <span className="head" style={{ textAlign: 'center' }}>
          Reps
        </span>
        <span className="head" style={{ textAlign: 'center' }}>
          {bodyweight ? '+ Weight' : 'Weight'}
        </span>
        <span className="head head-done">Done</span>
        {entry.sets.map((set, i) => {
          const h = hint(i);
          const shownWeight = set.weightKg ?? h?.weightKg ?? null;
          return (
            <div key={set.id} className={`set-row${set.done ? ' done' : ''}`} style={{ display: 'contents' }}>
              <SetMenu
                label={label(i)}
                warmup={!!set.warmup}
                plates={barbell && shownWeight != null ? platesLabel(Number(formatWeight(shownWeight, unit)), unit) : null}
                weightText={shownWeight != null ? `${formatWeight(shownWeight, unit)} ${unit}` : ''}
                onToggleWarmup={() => setSet(set.id, { warmup: !set.warmup })}
                onDelete={() => onChange((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== set.id) }))}
              />
              <NumericInput
                className="set-input"
                ariaLabel={`Set ${label(i)} reps`}
                value={set.reps}
                placeholder={h?.reps != null ? String(h.reps) : entry.targetReps?.split(/\D/)[0] || '0'}
                format={(v) => (v == null ? '' : String(v))}
                parse={(t) => (t ? parseInt(t, 10) : null)}
                onChange={(reps) => setSet(set.id, { reps, done: reps ? set.done : false })}
              />
              <div className="affix">
                <NumericInput
                  className="set-input"
                  decimal
                  ariaLabel={`Set ${label(i)} weight in ${unit}`}
                  value={set.weightKg}
                  placeholder={h?.weightKg != null ? formatWeight(h.weightKg, unit) : bodyweight ? 'BW' : '0'}
                  format={(v) => (v == null ? '' : formatWeight(v, unit))}
                  parse={(t) => parseWeightInput(t, unit)}
                  onChange={(weightKg) => setSet(set.id, { weightKg })}
                />
                <span className="suffix">{unit}</span>
              </div>
              <button
                className={`check${set.done ? ' on' : ''}`}
                onClick={() => toggleDone(set, i)}
                aria-label={set.done ? `Mark set ${label(i)} not done` : `Complete set ${label(i)}`}
                aria-pressed={set.done}
              >
                <Check size={17} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="spread" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: -6 }} onClick={addSet}>
          <Plus size={14} /> Add set
        </button>
        <span style={{ marginRight: -6 }}>
          <SupersetButton inSuperset={inSuperset} pillShown={pillShown} onClick={onSuperset} />
        </span>
      </div>
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return <>{formatDuration(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60000)))}</>;
}
