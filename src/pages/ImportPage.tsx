import { AlertTriangle, ArrowLeft, Check, Pencil } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { Stepper } from '../components/Stepper';
import { PageSkeleton } from '../components/Skeleton';
import { DEFAULT_REPS, PLAN_PATH } from '../config';
import { pluralize } from '../core/format';
import { parseWorkoutText } from '../core/importParser';
import { loadCatalog, type CatalogExercise } from '../data/catalog';
import {
  buildImportDraft,
  countOpenFlags,
  openRepFlags,
  saveImport,
  type DraftExercise,
  type DraftWorkout,
  type ExerciseFlag,
  type MatchChoice,
  type RoutineChoice,
} from '../data/importPlan';
import { useSettings } from '../hooks/settings';
import { useExercises, useRoutines, useWorkouts } from '../hooks/useRepo';

const PLACEHOLDER = `Upper A
Incline Dumbbell Press 2x8 35
Lat Pulldown 2x10-12 120
Lateral Raises 3x12 15 (slow)

Lower
Squats 3x5 185
Romanian Deadlift 2x10 135`;

export function ImportPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const exercises = useExercises();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<DraftWorkout[] | null>(null);
  const [routine, setRoutine] = useState<RoutineChoice>({ kind: 'none' });
  const [saveAsHistory, setSaveAsHistory] = useState(true);
  const [picking, setPicking] = useState<{ workout: string; exercise: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadCatalog().then(setCatalog);
  }, []);

  const review = () => {
    if (!exercises || !workouts) return;
    const parsed = parseWorkoutText(text);
    const next = buildImportDraft(parsed, exercises, catalog, workouts);
    setDrafts(next);
    // Suggest grouping a multi-workout split into a routine, unless it updates existing workouts.
    const updatesExisting = next.some((w) => w.existingId);
    setRoutine(next.length > 1 && !updatesExisting ? { kind: 'new', name: 'My split' } : { kind: 'none' });
    window.scrollTo({ top: 0 });
  };

  const updateWorkout = (key: string, fn: (w: DraftWorkout) => DraftWorkout) =>
    setDrafts((ds) => ds && ds.map((w) => (w.key === key ? fn(w) : w)));

  const updateExercise = (wKey: string, eKey: string, fn: (e: DraftExercise) => DraftExercise) =>
    updateWorkout(wKey, (w) => ({ ...w, exercises: w.exercises.map((e) => (e.key === eKey ? fn(e) : e)) }));

  const resolve = (e: DraftExercise, flag: ExerciseFlag): DraftExercise => ({ ...e, flags: e.flags.filter((f) => f !== flag) });

  if (!exercises || !workouts || !routines) return <PageSkeleton />;

  // ---------- Step 1: paste ----------
  if (!drafts) {
    const preview = parseWorkoutText(text);
    const exerciseCount = preview.reduce((n, w) => n + w.exercises.length, 0);
    return (
      <div className="narrow">
        <Link to={PLAN_PATH} className="back-link">
          <ArrowLeft size={15} /> Workouts
        </Link>
        <h1 className="title">Import workouts</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          Paste your split from your notes. Put each workout's name on its own line, then one exercise per line, like
          “Bench Press 3x8 135”. You'll review everything before it's saved.
        </p>
        <textarea
          className="input import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          autoFocus
          spellCheck={false}
        />
        <div className="spread" style={{ marginTop: 12 }}>
          <span className="muted small">
            {text.trim() ? `Found ${pluralize(preview.length, 'workout')}, ${pluralize(exerciseCount, 'exercise')}` : ''}
          </span>
          <button className="btn btn-primary" onClick={review} disabled={exerciseCount === 0}>
            Review import
          </button>
        </div>
      </div>
    );
  }

  // ---------- Step 2: review ----------
  const open = countOpenFlags(drafts);
  const repQuestions = openRepFlags(drafts);

  /** Answers every open rep-range question at once. */
  const setAllReps = (choice: 'default' | 'notes') =>
    setDrafts(
      (ds) =>
        ds &&
        ds.map((w) => ({
          ...w,
          exercises: w.exercises.map((e) =>
            e.flags.includes('reps')
              ? { ...resolve(e, 'reps'), reps: choice === 'default' ? DEFAULT_REPS : String(e.loggedReps) }
              : e,
          ),
        })),
    );
  const included = drafts.filter((w) => w.include && w.exercises.some((e) => e.include));

  const save = async () => {
    setSaving(true);
    try {
      await saveImport(drafts, { routine, saveAsHistory, unit: settings.unit, catalog });
      navigate(PLAN_PATH);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="narrow">
      <button className="back-link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={() => setDrafts(null)}>
        <ArrowLeft size={15} /> Edit text
      </button>
      <h1 className="title">Review import</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
        {open > 0 ? (
          <span className="flag-count">
            <AlertTriangle size={14} /> {pluralize(open, 'item')} to confirm
          </span>
        ) : (
          <span className="row" style={{ gap: 6, display: 'inline-flex', color: 'var(--success)' }}>
            <Check size={15} /> Everything's confirmed
          </span>
        )}
        {' · '}Uncheck anything you don't want.
      </p>

      {repQuestions.length > 1 && (
        <div className="flag" style={{ margin: '18px 0 0' }}>
          <AlertTriangle size={14} />
          <span style={{ flex: '1 1 260px' }}>
            {pluralize(repQuestions.length, 'line lists', 'lines list')} the reps you did (like “2x{repQuestions[0].loggedReps}”), not a
            target range. What should the targets be?
          </span>
          <div className="row-wrap" style={{ gap: 6 }}>
            <button className="chip" onClick={() => setAllReps('default')}>
              {DEFAULT_REPS} for all
            </button>
            <button className="chip" onClick={() => setAllReps('notes')}>
              Use the numbers from my notes
            </button>
          </div>
        </div>
      )}

      <div className="stack" style={{ marginTop: 20, gap: 18 }}>
        {drafts.map((w) => (
          <section key={w.key} className={`card import-workout${w.include ? '' : ' excluded'}`}>
            <div className="row" style={{ gap: 10 }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={w.include}
                onChange={(e) => updateWorkout(w.key, (x) => ({ ...x, include: e.target.checked }))}
                aria-label={`Import ${w.name}`}
              />
              <input
                className="title-input"
                style={{ fontSize: 20 }}
                value={w.name}
                onChange={(e) => updateWorkout(w.key, (x) => ({ ...x, name: e.target.value }))}
                aria-label="Workout name"
              />
            </div>

            {w.include && w.existingId && (
              <div className={`flag${w.onExisting ? ' resolved' : ''}`}>
                {!w.onExisting && <AlertTriangle size={14} />}
                <span>You already have a workout called “{w.name}”.</span>
                <div className="segmented">
                  <button className={w.onExisting === 'update' ? 'on' : ''} onClick={() => updateWorkout(w.key, (x) => ({ ...x, onExisting: 'update' }))}>
                    Replace its exercises
                  </button>
                  <button className={w.onExisting === 'new' ? 'on' : ''} onClick={() => updateWorkout(w.key, (x) => ({ ...x, onExisting: 'new' }))}>
                    Add as new
                  </button>
                </div>
              </div>
            )}

            {w.include && (
              <div className="import-rows">
                {w.exercises.map((e) => {
                  const partner = e.alternativeGroup ? w.exercises.find((x) => x.alternativeGroup === e.alternativeGroup && x.key !== e.key) : undefined;
                  const set = (fn: (x: DraftExercise) => DraftExercise) => updateExercise(w.key, e.key, fn);
                  return (
                    <div key={e.key} className={`import-row${e.include ? '' : ' excluded'}`}>
                      <div className="import-main">
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={e.include}
                          onChange={(ev) => set((x) => ({ ...x, include: ev.target.checked }))}
                          aria-label={`Import ${e.match.name}`}
                        />
                        <div className="import-name">
                          <div className="import-title">
                            <button className="import-match" onClick={() => setPicking({ workout: w.key, exercise: e.key })} title="Choose a different exercise">
                              <span>{e.match.name}</span>
                              <Pencil size={12} className="muted" />
                            </button>
                            <span className="import-source">{matchLabel(e.match)}</span>
                          </div>
                          <span className="muted small">“{e.raw}”</span>
                        </div>
                      </div>

                      {e.include && (
                        <div className="import-fields">
                          <div>
                            <span className="label">Sets</span>
                            <Stepper label="sets" value={e.sets} onChange={(sets) => set((x) => resolve({ ...x, sets }, 'missing'))} />
                          </div>
                          <label>
                            <span className="label">Target reps</span>
                            <input
                              className="input tnum"
                              value={e.reps}
                              placeholder={DEFAULT_REPS}
                              onChange={(ev) => set((x) => resolve(resolve({ ...x, reps: ev.target.value }, 'reps'), 'missing'))}
                            />
                          </label>
                          <label>
                            <span className="label">Last weight</span>
                            <div className="affix">
                              <input
                                className="input tnum"
                                inputMode="decimal"
                                value={e.weight}
                                placeholder="—"
                                style={{ paddingRight: 30 }}
                                onChange={(ev) => set((x) => resolve({ ...x, weight: ev.target.value.replace(/[^\d.]/g, '') }, 'weight'))}
                              />
                              <span className="suffix">{settings.unit}</span>
                            </div>
                          </label>
                          <label className="import-note">
                            <span className="label">Note</span>
                            <input className="input" value={e.note} placeholder="Optional" onChange={(ev) => set((x) => ({ ...x, note: ev.target.value }))} />
                          </label>
                        </div>
                      )}

                      {(e.include || e.flags.includes('alternative')) &&
                        e.flags
                          .filter((flag) => !(flag === 'reps' && repQuestions.length > 1))
                          .map((flag) => (
                          <Flag key={flag}>
                            {flag === 'match' && (
                              <>
                                <span>Which exercise is “{e.sourceName}”?</span>
                                <div className="row-wrap" style={{ gap: 6 }}>
                                  {e.matchOptions.map((m) => (
                                    <button
                                      key={matchKey(m)}
                                      className={`chip${matchKey(m) === matchKey(e.match) ? ' selected' : ''}`}
                                      onClick={() => set((x) => resolve({ ...x, match: m }, 'match'))}
                                    >
                                      {m.kind === 'new' ? `New: ${m.name}` : m.name}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {flag === 'reps' && (
                              <>
                                <span>
                                  Your note says {e.loggedReps} reps. What's the target range?
                                </span>
                                <div className="row-wrap" style={{ gap: 6 }}>
                                  {[DEFAULT_REPS, String(e.loggedReps)].map((r) => (
                                    <button key={r} className={`chip${e.reps === r ? ' selected' : ''}`} onClick={() => set((x) => resolve({ ...x, reps: r }, 'reps'))}>
                                      {r}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {flag === 'missing' && (
                              <>
                                <span>No sets or reps on this line. Check them above.</span>
                                <button className="chip" onClick={() => set((x) => resolve(x, 'missing'))}>
                                  Looks right
                                </button>
                              </>
                            )}
                            {flag === 'weight' && (
                              <>
                                <span>“{e.weightText}”: what weight did you lift?</span>
                                <div className="row-wrap" style={{ gap: 6 }}>
                                  {weightOptions(e.weightText ?? '').map((o) => (
                                    <button
                                      key={o.value}
                                      className={`chip${e.weight === o.value ? ' selected' : ''}`}
                                      onClick={() => set((x) => resolve({ ...x, weight: o.value }, 'weight'))}
                                    >
                                      {o.value} {settings.unit}
                                      {o.hint && <span className="muted"> · {o.hint}</span>}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {flag === 'alternative' && partner && (
                              <>
                                <span>
                                  “{e.sourceName}” and “{partner.sourceName}” look like alternatives (“or” in your notes).
                                </span>
                                <div className="row-wrap" style={{ gap: 6 }}>
                                  <button className="chip" onClick={() => setAlternative(w.key, e.alternativeGroup!, 'both')}>
                                    Keep both
                                  </button>
                                  <button className="chip" onClick={() => setAlternative(w.key, e.alternativeGroup!, e.key)}>
                                    Only {e.sourceName}
                                  </button>
                                </div>
                              </>
                            )}
                          </Flag>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      <section className="card section" style={{ marginTop: 22 }}>
        <div className="stack" style={{ gap: 14 }}>
          <label>
            <span className="label">Routine</span>
            <select
              className="select"
              value={routine.kind === 'existing' ? routine.id : routine.kind}
              onChange={(e) => {
                const v = e.target.value;
                setRoutine(v === 'none' ? { kind: 'none' } : v === 'new' ? { kind: 'new', name: 'My split' } : { kind: 'existing', id: v });
              }}
            >
              <option value="none">Don't add to a routine</option>
              <option value="new">New routine…</option>
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  Add to “{r.name}”
                </option>
              ))}
            </select>
          </label>
          {routine.kind === 'new' && (
            <label>
              <span className="label">Routine name</span>
              <input className="input" value={routine.name} onChange={(e) => setRoutine({ kind: 'new', name: e.target.value })} />
            </label>
          )}
          <label className="row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" className="checkbox" checked={saveAsHistory} onChange={(e) => setSaveAsHistory(e.target.checked)} />
            <span>
              <span style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>Save these weights as your last session</span>
              <span className="muted small">Logs today's date with the reps and weights from your notes, so “Previous” is filled in next time.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="sticky-bar">
        <span className="small">
          {open > 0 ? <span className="flag-count">{pluralize(open, 'item')} to confirm</span> : `${pluralize(included.length, 'workout')} ready`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={open > 0 || included.length === 0 || saving}>
          {saving ? 'Saving…' : `Save ${pluralize(included.length, 'workout')}`}
        </button>
      </div>

      {picking && (
        <ExercisePicker
          title="Choose exercise"
          onClose={() => setPicking(null)}
          onPick={(ex) => {
            updateExercise(picking.workout, picking.exercise, (x) =>
              resolve({ ...x, match: { kind: 'existing', exerciseId: ex.id, name: ex.name } }, 'match'),
            );
            setPicking(null);
          }}
        />
      )}
    </div>
  );

  function setAlternative(wKey: string, group: string, keep: 'both' | string) {
    updateWorkout(wKey, (w) => ({
      ...w,
      exercises: w.exercises.map((e) =>
        e.alternativeGroup === group
          ? { ...resolve(e, 'alternative'), include: keep === 'both' || e.key === keep }
          : e,
      ),
    }));
  }
}

function Flag({ children }: { children: ReactNode }) {
  return (
    <div className="flag">
      <AlertTriangle size={14} />
      {children}
    </div>
  );
}

function matchKey(m: MatchChoice) {
  return m.kind === 'existing' ? `e:${m.exerciseId}` : m.kind === 'library' ? `l:${m.catalogId}` : `n:${m.name.toLowerCase()}`;
}

function matchLabel(m: MatchChoice) {
  return m.kind === 'existing' ? 'Your exercise' : m.kind === 'library' ? 'From the library' : 'New exercise';
}

/**
 * Likely readings of a weight expression. "70/140" → either number. "45+10+10" → the plain
 * total, or a bar with those plates on each side (45 + 2×20).
 */
function weightOptions(text: string): { value: string; hint?: string }[] {
  const parts = text.split(/[/+]/).map(Number).filter((n) => Number.isFinite(n));
  if (!text.includes('+')) return [...new Set(parts)].map((n) => ({ value: String(n) }));
  const [first, ...rest] = parts;
  const restSum = rest.reduce((s, n) => s + n, 0);
  const total = first + restSum;
  const perSide = first + 2 * restSum;
  return [
    { value: String(total), hint: 'total' },
    { value: String(perSide), hint: `${first} + ${rest.join('+')} each side` },
  ];
}
