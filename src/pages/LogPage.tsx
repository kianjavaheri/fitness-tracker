import { PageHead } from '../components/AccountButton';
import { LiftLog } from '../components/LiftLog';
import { PageSkeleton } from '../components/Skeleton';
import { followedRoutine } from '../core/stats';
import { useSettings } from '../hooks/settings';
import { useExercises, useRoutines, useSessions, useWorkouts } from '../hooks/useRepo';

/** Log: the notes-app view of what you lifted, a table per workout (components/LiftLog.tsx). */
export function LogPage() {
  const sessions = useSessions();
  const exercises = useExercises();
  const workouts = useWorkouts();
  const routines = useRoutines();
  const { settings } = useSettings();

  if (!sessions || !exercises || !workouts || !routines) return <PageSkeleton />;

  return (
    <>
      <PageHead>
        <h1 className="title">Log</h1>
      </PageHead>
      <div className="section" style={{ marginTop: 24 }}>
        <LiftLog
          routines={routines}
          workouts={workouts}
          exercises={exercises}
          sessions={sessions}
          unit={settings.unit}
          followed={followedRoutine(routines, settings.activeRoutineId)}
        />
      </div>
    </>
  );
}
