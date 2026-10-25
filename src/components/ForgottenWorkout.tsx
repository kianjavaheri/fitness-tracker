import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatTime, pluralize, relativeDay } from '../core/format';
import { now } from '../core/ids';
import { finalizeSession, forgottenSession, lastActivity } from '../core/sessions';
import { sessionSummary } from '../core/stats';
import type { Session } from '../core/types';
import { repo } from '../data';
import { useSessions } from '../hooks/useRepo';
import { Modal } from './Modal';

/**
 * Asks about a workout that's been left open with no changes for 3 hours: finish it at the last change (so the
 * duration is right), keep going, or discard it when nothing was logged. Never finishes anything on its own.
 */
export function ForgottenWorkoutPrompt() {
  const sessions = useSessions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Re-checked when the app comes back to the foreground, and every minute while it's open.
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && setAt(Date.now());
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const session = sessions ? forgottenSession(sessions, at) : null;
  if (!session) return null;

  const live = session.live !== false;
  const lastAt = lastActivity(session);
  const logged = sessionSummary(session).sets;
  const sameDay = new Date(lastAt).toDateString() === new Date(at).toDateString();
  const since = sameDay ? formatTime(lastAt) : `${relativeDay(lastAt, true)} at ${formatTime(lastAt)}`;

  // The session page holds its own copy while open; leave it so that copy can't be saved over this decision.
  const leavePage = (to: string) => pathname === `/session/${session.id}` && navigate(to, { replace: true });

  const keepGoing = () => void repo.saveSession({ ...session, snoozedAt: now() });
  const finish = async (s: Session) => {
    await repo.saveSession(finalizeSession(live ? { ...s, finishedAt: lastAt } : s));
    leavePage('/workouts');
  };
  const discard = async () => {
    await repo.deleteSession(session.id);
    leavePage('/');
  };

  return (
    <Modal title={live ? 'Still working out?' : 'Still logging?'} onClose={keepGoing}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        “{session.name}” is still open, and nothing has changed since {since}.{' '}
        {logged > 0 ? `${pluralize(logged, 'set')} logged.` : 'Nothing has been logged in it.'}
      </p>
      <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
        <button className="btn btn-sm" autoFocus onClick={keepGoing}>
          Keep going
        </button>
        {logged > 0 ? (
          <button className="btn btn-primary btn-sm" onClick={() => finish(session)}>
            {live ? `Finish at ${formatTime(lastAt)}` : 'Save it'}
          </button>
        ) : (
          <button className="btn btn-sm" style={{ background: 'var(--danger)', color: 'var(--page-base)' }} onClick={discard}>
            Discard
          </button>
        )}
      </div>
    </Modal>
  );
}
