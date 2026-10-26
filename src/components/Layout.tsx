import { ChartLine, Dumbbell, House, Moon, Plus, Settings, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { APP_NAME } from '../config';
import { useSettings } from '../hooks/settings';
import { useEdgeSwipeBack } from '../hooks/useEdgeSwipeBack';
import { useTabSwipe, type SwipeState } from '../hooks/useTabSwipe';
import { useSessions } from '../hooks/useRepo';
import { useNativeRestTimer } from '../native/rest';
import { preloadTabPages, TAB_PATHS } from '../pages/tabPages';
import { AccountMenu } from './AccountMenu';
import { Avatar } from './Avatar';
import { ForgottenWorkoutPrompt } from './ForgottenWorkout';
import { SyncIndicator } from './SyncIndicator';
import { TabPager } from './TabPager';

const LINKS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/analytics', label: 'Analytics', icon: ChartLine },
];
const [HOME, WORKOUTS, ANALYTICS] = LINKS;

/** Scroll position per history entry, so Back returns to the same place. */
const scrollPositions = new Map<string, number>();

/**
 * Bottom-tab slot that's current, for the sliding highlight: Home 0, Workouts 1 (also the editors under /edit, and a
 * finished workout, opened from History), Check in 2 (also the workout in progress, which the + leads to: the highlight
 * stays a ring around the + rather than sliding away), Analytics 3, Account 4; -1 for anything else.
 */
function activeTab(pathname: string, openSessionId: string | undefined): number {
  if (pathname === '/') return 0;
  if (pathname === '/check-in' || (openSessionId && pathname === `/session/${openSessionId}`)) return 2;
  if (pathname.startsWith('/workouts') || pathname.startsWith('/edit') || pathname.startsWith('/session/')) return 1;
  if (pathname.startsWith('/analytics')) return 3;
  if (pathname === '/settings') return 4;
  return -1;
}

export function Layout() {
  const { resolvedTheme, update } = useSettings();
  const { status, user } = useAuth();
  const location = useLocation();
  const { pathname } = location;
  const navigationType = useNavigationType();
  // Reached by swiping between tabs: it's already in place, so no entrance.
  const swiped = navigationType === 'PUSH' && !!(location.state as SwipeState | null)?.swiped;
  const onTab = TAB_PATHS.includes(pathname);
  useEdgeSwipeBack();
  useTabSwipe();
  // An unfinished workout is shown from every page (blue ring on the +, or a pill in the top nav) and one tap away.
  const open = useSessions()?.find((s) => !s.finishedAt);
  const tab = activeTab(pathname, open?.id);
  useNativeRestTimer(open);
  const openLabel = open ? `${open.live === false ? 'Logging' : 'Live'}: ${open.name}` : '';

  // New pages start at the top; going back returns to where you were (pages render after their data loads, so keep
  // trying briefly until the page is tall enough).
  useEffect(() => {
    const key = location.key;
    const saved = navigationType === 'POP' ? scrollPositions.get(key) : undefined;
    let tries = 0;
    let frame = 0;
    const restore = () => {
      window.scrollTo({ top: saved ?? 0 });
      if (saved && Math.abs(window.scrollY - saved) > 2 && ++tries < 60) frame = requestAnimationFrame(restore);
    };
    restore();
    const onScroll = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    if (document.documentElement.classList.contains('standalone')) preloadTabPages();
  }, []);

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
        {onTab ? (
          // The bottom-tab pages stay alive (and their neighbours are drawn) so tabs can be swiped like a pager.
          <TabPager location={location} enter={!swiped} />
        ) : (
          // A fresh page per route: no state (an open notes pad, a draft) carries over from one record to another.
          <main className="paper" key={pathname}>
            <Outlet />
          </main>
        )}
      </div>

      <ForgottenWorkoutPrompt />
      <SyncIndicator />

      {/* Installed as an app (html.standalone, set in index.html) the top bar gives way to app-style tabs. */}
      <div className="statusbar-scrim" aria-hidden />
      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          <span className="tab-indicator" style={{ '--i': Math.max(0, tab), '--c': tab === 2 ? 1 : 0, opacity: tab < 0 ? 0 : 1 } as CSSProperties} aria-hidden />
          {[HOME, WORKOUTS].map((l, i) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={`tab${tab === i ? ' active' : ''}`} aria-label={l.label} title={l.label}>
              <l.icon size={24} aria-hidden />
            </NavLink>
          ))}
          <div className="tab">
            {/* A plain Link: NavLink would add its own "active" (and rotate the +) on the live workout's page. */}
            <Link
              to={open ? `/session/${open.id}` : '/check-in'}
              // Rotated only on Check in itself, not when it leads to the live workout you're already on.
              className={`tab-checkin${pathname === '/check-in' ? ' active' : ''}${open ? ' is-live' : ''}`}
              aria-label={open ? `${openLabel}. Go back to it` : 'Check in'}
              title={open ? openLabel : 'Check in'}
            >
              <Plus size={26} strokeWidth={2.4} aria-hidden />
            </Link>
          </div>
          <NavLink to={ANALYTICS.to} className={`tab${tab === 3 ? ' active' : ''}`} aria-label={ANALYTICS.label} title={ANALYTICS.label}>
            <ANALYTICS.icon size={24} aria-hidden />
          </NavLink>
          <NavLink
            to="/settings"
            className={`tab${tab === 4 ? ' active' : ''}`}
            aria-label={user ? 'Account' : 'Settings'}
            title={user ? 'Account' : 'Settings'}
          >
            {user ? <Avatar user={user} size={26} /> : <Settings size={24} aria-hidden />}
          </NavLink>
        </div>
      </nav>
    </>
  );
}
