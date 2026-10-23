import { ChartLine, Dumbbell, House, Moon, Settings, SquarePen, Sun, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME } from '../config';
import { useSettings } from '../hooks/settings';
import { AccountMenu } from './AccountMenu';
import { Avatar } from './Avatar';

const LINKS: { to: string; label: string; icon: LucideIcon; short?: string; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/analytics', label: 'Analytics', icon: ChartLine },
  { to: '/edit', label: 'Edit workouts', icon: SquarePen, short: 'Edit' },
];

export function Layout() {
  const { resolvedTheme, update } = useSettings();
  const { status, user } = useAuth();
  const { pathname } = useLocation();

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
                <span className="nav-label">
                  {l.short ? (
                    <>
                      <span className="label-long">{l.label}</span>
                      <span className="label-short">{l.short}</span>
                    </>
                  ) : (
                    l.label
                  )}
                </span>
              </NavLink>
            ))}
          </nav>
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

      {/* Installed as an app (html.standalone, set in index.html) the top bar gives way to app-style tabs. */}
      <div className="statusbar-scrim" aria-hidden />
      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
              <l.icon size={22} aria-hidden />
              <span>{l.short ?? l.label}</span>
            </NavLink>
          ))}
          <NavLink to="/settings" className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {user ? <Avatar user={user} size={24} /> : <Settings size={22} aria-hidden />}
            <span>{user ? 'Account' : 'Settings'}</span>
          </NavLink>
        </div>
      </nav>
    </>
  );
}
