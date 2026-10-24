import { useSearchParams } from 'react-router-dom';
import { WorkoutPlan } from './EditWorkoutsPage';
import { WorkoutHistory } from './WorkoutLogPage';

/** Workouts: what you've logged (History) and what you plan to do (Plan), on one page. */
export function WorkoutsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'plan' ? 'plan' : 'history';

  return (
    <>
      <div className="spread">
        <h1 className="title">Workouts</h1>
        <div className="segmented" role="tablist" aria-label="Workouts view">
          <button role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'on' : ''} onClick={() => setParams({}, { replace: true })}>
            History
          </button>
          <button role="tab" aria-selected={view === 'plan'} className={view === 'plan' ? 'on' : ''} onClick={() => setParams({ view: 'plan' }, { replace: true })}>
            Plan
          </button>
        </div>
      </div>
      {/* key replays the entrance cascade when switching views */}
      <div key={view}>{view === 'plan' ? <WorkoutPlan /> : <WorkoutHistory />}</div>
    </>
  );
}
