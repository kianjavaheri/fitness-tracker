import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import { PLAN_PATH } from '../config';
import { pluralize } from '../core/format';
import { decodeShare } from '../core/share';
import { WEEKDAYS } from '../core/stats';
import { addShared } from '../data/shared';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Opened from a share link (/share#…): a preview of the workout or routine, and one button to add it. */
export function SharePage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(false);
  const payload = decodeShare(hash.slice(1));

  if (!payload) {
    return (
      <div className="narrow">
        <h1 className="title">Shared workout</h1>
        <div className="empty section">This link is incomplete or damaged. Ask for it to be shared again.</div>
      </div>
    );
  }

  const title = payload.routine?.name ?? payload.workouts[0]?.name ?? 'Shared workout';
  const add = async () => {
    setBusy(true);
    try {
      const { routineId, workoutIds } = await addShared(payload);
      notify(`Added “${title}”`);
      const to = routineId ? `/edit/routines/${routineId}` : `/edit/workouts/${workoutIds[0]}?from=${encodeURIComponent(PLAN_PATH)}`;
      navigate(to, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <Link to="/" className="back-link">
        <ArrowLeft size={15} /> Home
      </Link>
      <span className="muted small">Shared {payload.routine ? 'routine' : 'workout'}</span>
      <h1 className="title" style={{ marginTop: 2 }}>
        {title}
      </h1>
      <div className="stack section" style={{ marginTop: 18, gap: 10 }}>
        {payload.workouts.map((w, i) => {
          const days = payload.routine?.days?.[i] ?? [];
          return (
            <div key={i} className="card" style={{ padding: '14px 16px' }}>
              <div className="card-title" style={{ fontSize: 16 }}>
                {w.name}
                {days.length > 0 && (
                  <span className="muted small" style={{ fontWeight: 500, marginLeft: 8 }}>
                    {WEEK_ORDER.filter((d) => days.includes(d))
                      .map((d) => WEEKDAYS[d])
                      .join(', ')}
                  </span>
                )}
              </div>
              <div className="card-body small clamp-4">{w.exercises.map((e) => `${e.name} ${e.targetSets}×${e.targetReps}`).join(' · ')}</div>
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 14 }}>
        Adds {pluralize(payload.workouts.length, 'workout')}
        {payload.routine ? ' and the routine' : ''} to your plan. Exercises you already have are reused; nothing of yours
        changes.
      </p>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button className="btn btn-primary" onClick={add} disabled={busy}>
          <Plus size={15} /> {busy ? 'Adding…' : 'Add to my workouts'}
        </button>
        <Link to="/" className="btn btn-ghost">
          Not now
        </Link>
      </div>
    </div>
  );
}
