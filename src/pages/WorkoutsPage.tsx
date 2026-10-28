import { PageHead } from '../components/AccountButton';
import { WorkoutPlan } from './EditWorkoutsPage';

/** Workouts: your plan (routines, workouts, exercises, import). What you've logged is on Home and in History. */
export function WorkoutsPage() {
  return (
    <>
      <PageHead>
        <h1 className="title">Workouts</h1>
      </PageHead>
      <WorkoutPlan />
    </>
  );
}
