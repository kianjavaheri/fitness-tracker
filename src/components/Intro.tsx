import { ArrowLeft, ArrowRight, Check, ChevronRight, NotebookPen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME } from '../config';
import { newId, now } from '../core/ids';
import { uniqueName } from '../core/plan';
import { followedRoutine } from '../core/stats';
import type { ID, Routine } from '../core/types';
import { repo } from '../data';
import { saveNewWorkout } from '../data/newWorkout';
import { useSettings } from '../hooks/settings';
import { useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';
import type { GridItem } from './ExerciseGrid';
import { togglePicked, WorkoutFields } from './NewWorkout';

/**
 * TESTING: also shows the intro to accounts that already have workouts (the developer's own, to try it). Set to false
 * so only new accounts see it.
 */
const SHOW_INTRO_TO_EXISTING = true;

/**
 * Shows the first-run intro once per account: to a new user (no routines or workouts yet), or when asked for again
 * from Settings (`introDone: false`), once settings have loaded and while no workout is open. Finishing or skipping it
 * sets `Settings.introDone`.
 */
export function IntroGate() {
  const { settings, ready } = useSettings();
  const routines = useRoutines();
  const workouts = useWorkouts();
  const sessions = useSessions();
  if (!ready || !routines || !workouts || !sessions || settings.introDone) return null;
  if (sessions.some((s) => !s.finishedAt)) return null;
  const isNew = routines.length === 0 && workouts.length === 0;
  if (settings.introDone === undefined && !isNew && !SHOW_INTRO_TO_EXISTING) return null;
  return <Intro />;
}

/** Common plans to start from: the routine's name and its workouts, in order. */
const PRESETS = [
  { name: 'Push / Pull / Legs', workouts: ['Push', 'Pull', 'Legs'] },
  { name: 'Upper / Lower', workouts: ['Upper', 'Lower'] },
  { name: 'Full Body', workouts: ['Full Body A', 'Full Body B'] },
];

type Step = 'welcome' | 'routine' | 'workout' | 'more' | 'done';

/**
 * The first-run window: what a routine, a workout and an exercise are (a routine holds workouts, a workout holds
 * exercises), then making a routine and its workouts, picking each workout's exercises from a grid. Not a tour of the
 * app: one explanation, then the setup.
 */
function Intro() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const [step, setStep] = useState<Step>('welcome');
  const [routineName, setRoutineName] = useState('');
  /** Workout names from the chosen preset, used in turn as each new workout's name. */
  const [planned, setPlanned] = useState<string[]>([]);
  const [routineId, setRoutineId] = useState<ID | null>(null);
  const [saved, setSaved] = useState<{ id: ID; name: string; count: number }[]>([]);
  const [workoutName, setWorkoutName] = useState('');
  const [picked, setPicked] = useState<GridItem[]>([]);
  const [busy, setBusy] = useState(false);

  // A window of its own: the page behind doesn't scroll.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // Each step starts at the top.
  useEffect(() => {
    document.querySelector('.intro-body')?.scrollTo({ top: 0 });
  }, [step]);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const nextPlanned = planned[saved.length];

  const finish = () => update({ introDone: true });

  const startWorkout = () => {
    setWorkoutName(nextPlanned ?? (saved.length ? '' : 'Day 1'));
    setPicked([]);
    setStep('workout');
  };

  const choosePreset = (preset: (typeof PRESETS)[number]) => {
    setRoutineName(preset.name);
    setPlanned(preset.workouts);
  };

  const toggle = (item: GridItem) => setPicked((list) => togglePicked(list, item));

  // Adds what was picked to your exercises, saves the workout, and puts it in the routine (made with the first one).
  const saveWorkout = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const workout = await saveNewWorkout(workoutName || `Day ${saved.length + 1}`, picked, routineId);
      if (!routineId) {
        const routines = await repo.listRoutines();
        const ts = now();
        const routine: Routine = {
          id: newId(),
          name: uniqueName(routineName.trim() || 'My routine', routines),
          workoutIds: [workout.id],
          createdAt: ts,
          updatedAt: ts,
        };
        await repo.saveRoutine(routine);
        setRoutineId(routine.id);
        setRoutineName(routine.name);
        // Follow it unless another routine already is (it drives Home's "Up next").
        if (!followedRoutine(routines, settings.activeRoutineId)) update({ activeRoutineId: routine.id });
      }
      setSaved((list) => [...list, { id: workout.id, name: workout.name, count: workout.exercises.length }]);
      setStep('more');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    finish();
    if (saved.length) navigate('/');
  };

  // A plan already written down in a notes app: Import from notes turns it into workouts (and a routine) instead.
  const importFromNotes = () => {
    finish();
    navigate('/edit/import');
  };

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label={`Welcome to ${APP_NAME}`} data-no-swipe>
      <div className="intro-panel">
        <div className="intro-top">
          {step === 'routine' || (step === 'workout' && saved.length === 0) ? (
            <button className="back-link" style={{ margin: 0 }} onClick={() => setStep(step === 'routine' ? 'welcome' : 'routine')}>
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <span />
          )}
          {step !== 'done' && (
            <button className="icon-btn" onClick={close} aria-label={saved.length ? 'Finish' : 'Skip the intro'} title={saved.length ? 'Finish' : 'Skip'}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="intro-body">
          {step === 'welcome' && (
            <>
              <h1 className="title">Welcome{firstName ? `, ${firstName}` : ''}</h1>
              <p className="intro-lead">
                {APP_NAME} holds your plan and every set you log. A plan has three parts, each inside the one above it.
              </p>
              <PlanDiagram />
              <div className="intro-terms">
                <Term level="routine" name="Routine">
                  Your plan, like Push / Pull / Legs. It holds a few workouts, in order, and Home shows which one is up next.
                </Term>
                <Term level="workout" name="Workout">
                  One day at the gym, like Push. It holds a list of exercises.
                </Term>
                <Term level="exercise" name="Exercise">
                  One movement, like Bench Press, with its sets and reps. When you train, you log each set.
                </Term>
              </div>
              <p className="muted small" style={{ marginTop: 22 }}>
                Plan already in your notes app?{' '}
                <button className="link-btn" onClick={importFromNotes}>
                  Import it instead
                </button>
              </p>
            </>
          )}

          {step === 'routine' && (
            <>
              <div className="intro-kicker">Step 1 of 2</div>
              <h1 className="title">Your routine</h1>
              <p className="intro-lead">Pick a common plan or name your own. You’ll add its workouts next.</p>
              <div className="intro-presets">
                {PRESETS.map((p) => (
                  <button key={p.name} className={`card intro-preset${routineName === p.name ? ' rb-outline' : ''}`} onClick={() => choosePreset(p)}>
                    <span className="card-title">{p.name}</span>
                    <span className="muted small">{p.workouts.join(' · ')}</span>
                  </button>
                ))}
              </div>
              <label style={{ display: 'block', marginTop: 18 }}>
                <span className="label">Or name it yourself</span>
                <input
                  className="input"
                  placeholder="My routine"
                  value={routineName}
                  onChange={(e) => {
                    setRoutineName(e.target.value);
                    setPlanned(PRESETS.find((p) => p.name === e.target.value)?.workouts ?? []);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && routineName.trim() && startWorkout()}
                />
              </label>
              <button className="card intro-import" onClick={importFromNotes}>
                <NotebookPen size={20} />
                <span style={{ flex: 1 }}>
                  <span className="card-title" style={{ display: 'block' }}>
                    Import from notes
                  </span>
                  <span className="muted small">Paste a plan you’ve written down and it becomes workouts.</span>
                </span>
                <ChevronRight size={18} className="muted" />
              </button>
            </>
          )}

          {step === 'workout' && (
            <>
              <div className="intro-kicker">
                {saved.length ? `${routineName} · workout ${saved.length + 1}` : `Step 2 of 2 · ${routineName.trim() || 'My routine'}`}
              </div>
              <h1 className="title">{saved.length ? 'Another workout' : 'Its first workout'}</h1>
              <p className="intro-lead">Name the day, then tap the exercises it has. You can change sets and reps later.</p>
              <WorkoutFields name={workoutName} onName={setWorkoutName} placeholder={`Day ${saved.length + 1}`} picked={picked} onToggle={toggle} />
            </>
          )}

          {step === 'more' && (
            <>
              <h1 className="title">Added to {routineName}</h1>
              <div className="stack" style={{ marginTop: 16, gap: 8 }}>
                {saved.map((w) => (
                  <div key={w.id} className="card intro-saved">
                    <Check size={16} className="intro-saved-check" />
                    <span className="card-title" style={{ flex: 1 }}>
                      {w.name}
                    </span>
                    <span className="muted small">{w.count === 1 ? '1 exercise' : `${w.count} exercises`}</span>
                  </div>
                ))}
              </div>
              <p className="intro-lead" style={{ marginTop: 16 }}>
                {nextPlanned
                  ? `Next in ${routineName} is ${nextPlanned}. Add it now, or later from Workouts.`
                  : 'Most routines have two to four workouts. Add another now, or later from Workouts.'}
              </p>
            </>
          )}

          {step === 'done' && (
            <>
              <h1 className="title">You’re set</h1>
              <p className="intro-lead">
                When you’re at the gym, tap <strong>+</strong> and pick today’s workout. Each set shows what you did last time, so
                you know what to beat.
              </p>
              <p className="intro-lead">Your routine and workouts are under Workouts, where you can change anything.</p>
            </>
          )}
        </div>

        <div className="intro-foot">
          {step === 'welcome' && (
            <>
              <button className="btn btn-ghost" onClick={close}>
                Skip for now
              </button>
              <button className="btn btn-primary" onClick={() => setStep('routine')}>
                Set up my routine <ArrowRight size={15} />
              </button>
            </>
          )}
          {step === 'routine' && (
            <>
              <span />
              <button className="btn btn-primary" onClick={startWorkout} disabled={!routineName.trim()}>
                Next <ArrowRight size={15} />
              </button>
            </>
          )}
          {step === 'workout' && (
            <>
              <span className="muted small">{picked.length === 1 ? '1 exercise' : `${picked.length} exercises`}</span>
              <button className="btn btn-primary" onClick={() => void saveWorkout()} disabled={!picked.length || busy}>
                {busy ? 'Saving…' : 'Save workout'}
              </button>
            </>
          )}
          {step === 'more' && (
            <>
              <button className="btn btn-ghost" onClick={() => setStep('done')}>
                I’m done
              </button>
              <button className="btn btn-primary" onClick={startWorkout}>
                {nextPlanned ? `Add ${nextPlanned}` : 'Add another'}
              </button>
            </>
          )}
          {step === 'done' && (
            <>
              <span />
              <button
                className="btn btn-primary"
                onClick={() => {
                  finish();
                  navigate('/');
                }}
              >
                Let’s go
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One of the three parts, with the colour it has in the diagram. */
function Term({ level, name, children }: { level: 'routine' | 'workout' | 'exercise'; name: string; children: string }) {
  return (
    <div className="intro-term">
      <span className={`intro-dot ${level}`} aria-hidden />
      <div>
        <div className="intro-term-name">{name}</div>
        <div className="muted small">{children}</div>
      </div>
    </div>
  );
}

/** A routine holding workouts, one opened to show its exercises. */
function PlanDiagram() {
  return (
    <div className="plan-diagram" aria-hidden>
      <div className="plan-box routine">
        <div className="plan-label">
          <span className="intro-dot routine" /> Routine <strong>Push / Pull / Legs</strong>
        </div>
        <div className="plan-box workout">
          <div className="plan-label">
            <span className="intro-dot workout" /> Workout <strong>Push</strong>
          </div>
          {[
            ['Bench Press', '3 × 8'],
            ['Overhead Press', '3 × 10'],
            ['Triceps Pushdown', '2 × 12'],
          ].map(([name, sets]) => (
            <div key={name} className="plan-box exercise">
              <span className="intro-dot exercise" /> {name}
              <span className="muted">{sets}</span>
            </div>
          ))}
        </div>
        <div className="plan-row">
          {['Pull', 'Legs'].map((name) => (
            <div key={name} className="plan-box workout closed">
              <span className="intro-dot workout" /> {name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
