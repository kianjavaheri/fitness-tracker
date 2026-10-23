import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DayActivity } from '../core/activity';
import { formatDuration, formatNumber, formatTime, pluralize } from '../core/format';
import { sessionDurationMinutes } from '../core/sessions';
import { sessionSummary } from '../core/stats';
import type { ID, Session } from '../core/types';
import { fromKg } from '../core/units';
import { useSettings } from '../hooks/settings';
import { Modal } from './Modal';

/**
 * Opening a trained day from the heatmap or week strip: a single session opens directly, several show a
 * day summary to pick from (otherwise only the latest was reachable).
 */
export function useOpenDay(sessions: Session[]): [(date: Date, day: DayActivity) => void, ReactNode] {
  const navigate = useNavigate();
  const [open, setOpen] = useState<{ date: Date; ids: ID[] } | null>(null);

  const openDay = (date: Date, day: DayActivity) => {
    if (day.sessions.length === 1) navigate(`/session/${day.sessions[0].id}`);
    else setOpen({ date, ids: day.sessions.map((s) => s.id) });
  };

  // Read from the live list so a session deleted elsewhere drops out of an open summary.
  const daySessions = open
    ? sessions.filter((s) => open.ids.includes(s.id)).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    : [];
  const modal = open && daySessions.length > 0 && (
    <DaySummary date={open.date} sessions={daySessions} onClose={() => setOpen(null)} />
  );
  return [openDay, modal];
}

function DaySummary({ date, sessions, onClose }: { date: Date; sessions: Session[]; onClose: () => void }) {
  const { settings } = useSettings();
  const sums = sessions.map(sessionSummary);
  const totalSets = sums.reduce((n, s) => n + s.sets, 0);
  const totalKg = sums.reduce((n, s) => n + s.volumeKg, 0);

  return (
    <Modal title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} onClose={onClose}>
      <p className="muted small tnum" style={{ margin: '0 0 12px' }}>
        {pluralize(sessions.length, 'session')} · {pluralize(totalSets, 'set')} · {formatNumber(fromKg(totalKg, settings.unit))}{' '}
        {settings.unit}
      </p>
      <div className="day-sessions">
        {sessions.map((s, i) => {
          const minutes = sessionDurationMinutes(s);
          return (
            <Link key={s.id} to={`/session/${s.id}`} className="list-row day-session" onClick={onClose}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="day-session-name">{s.name}</span>
                <span className="muted small tnum day-session-meta">
                  {formatTime(s.startedAt)} · {pluralize(sums[i].sets, 'set')} ·{' '}
                  {formatNumber(fromKg(sums[i].volumeKg, settings.unit))} {settings.unit}
                  {minutes != null && ` · ${formatDuration(minutes)}`}
                </span>
              </span>
              <ChevronRight size={16} className="muted" />
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}
