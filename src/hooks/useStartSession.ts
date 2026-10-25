import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../components/Feedback';
import type { Session } from '../core/types';
import { repo } from '../data';

/** Saves a new session and opens it, checking first whether another workout is still in progress. */
export function useStartSession() {
  const navigate = useNavigate();
  const { confirm } = useFeedback();
  return async (session: Session) => {
    const active = (await repo.listSessions()).find((s) => !s.finishedAt);
    if (
      active &&
      !(await confirm({
        title: `“${active.name}” is still in progress`,
        message: 'Start another workout anyway? Both stay open until you finish or cancel them.',
        confirmLabel: 'Start anyway',
      }))
    ) {
      return;
    }
    await repo.saveSession(session);
    navigate(`/session/${session.id}`);
  };
}
