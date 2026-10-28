import { lazy, Suspense, type ReactNode } from 'react';
import { PageSkeleton } from '../components/Skeleton';
import { CheckInPage } from './CheckInPage';
import { HomePage } from './HomePage';
import { LogPage } from './LogPage';
import { WorkoutsPage } from './WorkoutsPage';

// Charts are the heaviest dependency, so they're split out of the main bundle.
const loadAnalytics = () => import('./AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }));
export const AnalyticsPage = lazy(loadAnalytics);

/** In the app, fetch Analytics' code once things are idle, so swiping towards it shows the page, not a blank. */
export function preloadTabPages() {
  const run = () => void loadAnalytics();
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

/**
 * The pages behind the bottom tabs, in tab order. Layout draws them through TabPager (the current one, and in the app
 * its neighbours, ready to be swiped to); App's routes for these paths only make the URLs match.
 */
export const TAB_PAGES: { path: string; element: ReactNode }[] = [
  { path: '/', element: <HomePage /> },
  { path: '/workouts', element: <WorkoutsPage /> },
  // Behind the +: swiping passes through it like any other tab.
  { path: '/check-in', element: <CheckInPage /> },
  {
    path: '/analytics',
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <AnalyticsPage />
      </Suspense>
    ),
  },
  { path: '/log', element: <LogPage /> },
];

export const TAB_PATHS = TAB_PAGES.map((t) => t.path);
