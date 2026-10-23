import { Moon, Settings, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME } from '../config';
import { useSettings } from '../hooks/settings';
import { AccountMenu } from './AccountMenu';

const LINKS: { to: string; label: string; short?: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/workouts', label: 'Workouts' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/edit', label: 'Edit workouts', short: 'Edit' },
];

export function Layout() {
  const { resolvedTheme, update } = useSettings();
  const { status } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            {APP_NAME}
          </NavLink>
          <nav className="nav-links">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {l.short ? (
                  <>
                    <span className="label-long">{l.label}</span>
                    <span className="label-short">{l.short}</span>
                  </>
                ) : (
                  l.label
                )}
              </NavLink>
            ))}
          </nav>
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
    </>
  );
}
