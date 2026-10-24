import { ChartLine, Dumbbell, House, Moon, Plus, Settings, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME } from '../config';
import { useSettings } from '../hooks/settings';
import { useSessions } from '../hooks/useRepo';
import { AccountMenu } from './AccountMenu';
import { Avatar } from './Avatar';
import { ForgottenWorkoutPrompt } from './ForgottenWorkout';

const LINKS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/analytics', label: 'Analytics', icon: ChartLine },
];
const [HOME, WORKOUTS, ANALYTICS] = LINKS;

/**
 * Bottom-tab slot that's current, for the sliding highlight: Home 0, Workouts 1 (also the editors under /edit),
 * Check in 2 (the + has its own look, so no highlight), Analytics 3, Account 4; -1 for anything else.
 */
function activeTab(pathname: string): number {
  if (pathname === '/') return 0;
  if (pathname.startsWith('/workouts') || pathname.startsWith('/edit')) return 1;
  if (pathname.startsWith('/analytics')) return 3;
  if (pathname === '/settings') return 4;
  return -1;
}

export function Layout() {
  const { resolvedTheme, update } = useSettings();
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  const tab = activeTab(pathname);
  // An unfinished workout is shown from every page (blue ring on the +, or a pill in the top nav) and one tap away.
  const open = useSessions()?.find((s) => !s.finishedAt);
  const openLabel = open ? `${open.live === false ? 'Logging' : 'Live'}: ${open.name}` : '';

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // iOS home-screen apps can keep the pinned bars as they were first drawn during the launch zoom (or from the
  // app-switcher snapshot), which leaves them blurry until something in them changes. Nudge a fresh paint.
  useEffect(() => {
    const root = document.documentElement;
    const repaint = () => {
      root.classList.add('repaint');
      setTimeout(() => root.classList.remove('repaint'), 50);
    };
    const timers = [setTimeout(repaint, 400), setTimeout(repaint, 1200)];
    const onVisible = () => {
      if (document.visibilityState === 'visible') timers.push(setTimeout(repaint, 300));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            {APP_NAME}
          </NavLink>
          <nav className="nav-links">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                aria-label={l.label}
                title={l.label}
              >
                <l.icon size={15} className="nav-icon" aria-hidden />
                <span className="nav-label">{l.label}</span>
              </NavLink>
            ))}
          </nav>
          {open && (
            <NavLink to={`/session/${open.id}`} className="nav-live" title={`${openLabel}. Tap to go back to it`}>
              <span className="live-dot" aria-hidden />
              <span className="nav-live-label">{open.live === false ? 'Logging' : 'Live'}</span>
              <span className="nav-live-name">{open.name}</span>
            </NavLink>
          )}
          <span className="nav-divider" aria-hidden />
          {status === 'signed-in' ? (
            <AccountMenu />
          ) : (
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-link icon${isActive ? ' active' : ''}`}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={17} />
            </NavLink>
          )}
          <button
            className="nav-link subtle"
            onClick={() => update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
            aria-label="Toggle color theme"
          >
            <span className="label-long-xs">{resolvedTheme === 'dark' ? 'Light' : 'Dark'}</span>
            <span className="label-short-xs">{resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span>
          </button>
        </div>
      </header>

      <div className="shell">
        {/* key restarts the entrance animation when switching sections */}
        <main className="paper" key={pathname.split('/')[1]}>
          <Outlet />
        </main>
      </div>

      <ForgottenWorkoutPrompt />

      {/* Installed as an app (html.standalone, set in index.html) the top bar gives way to app-style tabs. */}
      <div className="statusbar-scrim" aria-hidden />
      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          <span className="tab-indicator" style={{ '--i': Math.max(0, tab), opacity: tab < 0 ? 0 : 1 } as CSSProperties} aria-hidden />
          {[HOME, WORKOUTS].map((l, i) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={`tab${tab === i ? ' active' : ''}`}>
              <l.icon size={22} aria-hidden />
              <span>{l.label}</span>
            </NavLink>
          ))}
          <div className="tab">
            <NavLink
              to={open ? `/session/${open.id}` : '/check-in'}
              className={({ isActive }) => `tab-checkin${isActive ? ' active' : ''}${open ? ' is-live' : ''}`}
              aria-label={open ? `${openLabel}. Go back to it` : 'Check in'}
              title={open ? openLabel : 'Check in'}
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden />
            </NavLink>
          </div>
          <NavLink to={ANALYTICS.to} className={`tab${tab === 3 ? ' active' : ''}`}>
            <ANALYTICS.icon size={22} aria-hidden />
            <span>{ANALYTICS.label}</span>
          </NavLink>
          <NavLink to="/settings" className={`tab${tab === 4 ? ' active' : ''}`}>
            {user ? <Avatar user={user} size={24} /> : <Settings size={22} aria-hidden />}
            <span>{user ? 'Account' : 'Settings'}</span>
          </NavLink>
        </div>
      </nav>
    </>
  );
}
