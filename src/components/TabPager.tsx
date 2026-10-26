import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Route, Routes, type Location } from 'react-router-dom';
import { TAB_PAGES, TAB_PATHS } from '../pages/tabPages';
import { TabActiveContext } from './tabActive';

/** Asks the pager to draw a tab now (a swipe started before its idle-time render): dispatched by useTabSwipe. */
export const NEED_TAB_EVENT = 'tabpager:need';

const isStandalone = () => document.documentElement.classList.contains('standalone');

/**
 * The bottom-tab pages, kept alive like a native tab bar's screens. The current tab is the page; in the installed app
 * its neighbours are also drawn (once things are idle), parked just off screen to either side (.swipe-peek), so a
 * swipe moves pages that already exist (useTabSwipe) and finishing one only changes which page is current — the same
 * elements, nothing rebuilt, so nothing stalls or jumps.
 */
export function TabPager({ location, enter }: { location: Location; enter: boolean }) {
  const current = location.pathname;
  const index = TAB_PATHS.indexOf(current);
  /** Tab pages drawn so far. Kept once drawn (there are only four), so a swipe never ends by unmounting a page. */
  const [drawn, setDrawn] = useState<string[]>([]);
  const currentRef = useRef<HTMLElement>(null);
  const draw = (paths: string[]) => setDrawn((d) => (paths.every((p) => d.includes(p)) ? d : [...d, ...paths.filter((p) => !d.includes(p))]));

  // The current page counts as drawn, so the tab just left stays parked beside the new one: it used to unmount the
  // moment a swipe finished and be rebuilt when idle — often during the next swipe, which then froze for a few frames.
  // (Set during render, so React redoes this render before committing it and the page is never removed.)
  if (isStandalone() && !drawn.includes(current)) setDrawn([...drawn, current]);

  useEffect(() => {
    if (!isStandalone()) return;
    const want = [index - 1, index + 1].filter((i) => i >= 0 && i < TAB_PATHS.length).map((i) => TAB_PATHS[i]);
    // After the page has settled, so drawing them never competes with the tab change itself.
    const run = () => draw(want);
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(run, { timeout: 800 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 300);
    return () => clearTimeout(id);
  }, [index]);

  useEffect(() => {
    const onNeed = (e: Event) => draw([(e as CustomEvent<string>).detail]);
    window.addEventListener(NEED_TAB_EVENT, onNeed);
    return () => window.removeEventListener(NEED_TAB_EVENT, onNeed);
  }, []);

  // Where the parked neighbours sit: the page's box as it is at the top of the page (where a tab opens). Also clears
  // what a finished swipe left on the pages, now that each is where its class puts it.
  useLayoutEffect(() => {
    const measure = () => {
      const page = currentRef.current;
      if (!page) return;
      const box = page.getBoundingClientRect();
      const style = document.documentElement.style;
      style.setProperty('--pager-top', `${box.top + window.scrollY}px`);
      style.setProperty('--pager-left', `${box.left}px`);
      style.setProperty('--pager-width', `${box.width}px`);
    };
    document.querySelectorAll<HTMLElement>('main.tab-page').forEach((el) => {
      el.style.transform = '';
      el.style.transition = '';
    });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current]);

  const paths = TAB_PATHS.filter((p) => p === current || drawn.includes(p));
  return (
    <>
      {paths.map((path) => {
        const element = TAB_PAGES.find((t) => t.path === path)?.element;
        // Same element type and key whichever role it has, so React keeps the page when it becomes (or stops being)
        // the current one.
        if (path === current) {
          return (
            <main key={path} ref={currentRef} data-tab={path} className={`paper tab-page${enter ? ' enter' : ''}`}>
              <TabActiveContext.Provider value={true}>
                <Routes location={location}>
                  <Route path="*" element={element} />
                </Routes>
              </TabActiveContext.Provider>
            </main>
          );
        }
        const side = TAB_PATHS.indexOf(path) < index ? 'peek-left' : 'peek-right';
        return (
          <main key={path} data-tab={path} className={`paper tab-page swipe-peek ${side}`} inert aria-hidden>
            <TabActiveContext.Provider value={false}>
              <Routes location={path}>
                <Route path="*" element={element} />
              </Routes>
            </TabActiveContext.Provider>
          </main>
        );
      })}
    </>
  );
}
