import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { canGoBack } from '../utils/history';

/** --ease-swipe in index.css. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Start within this far from the left edge… */
const EDGE_PX = 24;
/** …and drag at least this far to go back. */
const TRIGGER_PX = 90;

/** Sub-pages that swipe back like a native app (Settings too, opened from the account button); tab pages are the top of their stack. */
const SWIPEABLE = /^\/(session|edit)\/|^\/(settings|history)$/;

/**
 * Home-screen apps on iOS have no swipe-back gesture, so add one: drag from the left edge of a sub-page and the page
 * follows your finger; let go past the threshold to go back. Only in the installed app, and never inside a dialog.
 */
export function useEdgeSwipeBack() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!document.documentElement.classList.contains('standalone') || !SWIPEABLE.test(pathname)) return;
    let start: { x: number; y: number } | null = null;
    let page: HTMLElement | null = null;
    let dragging = false;

    const reset = (animate: boolean) => {
      if (page) {
        page.style.transition = animate ? `transform 0.35s ${EASE}, opacity 0.35s ${EASE}` : '';
        page.style.transform = '';
        page.style.opacity = '';
      }
      start = null;
      dragging = false;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > EDGE_PX || !canGoBack() || document.querySelector('.overlay')) return;
      start = { x: t.clientX, y: t.clientY };
      page = document.querySelector<HTMLElement>('main.paper:not(.swipe-peek)');
      // The workout in progress is drawn as a tab page (TabPager): it swipes between tabs instead.
      if (page?.classList.contains('tab-page')) {
        start = null;
        page = null;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!start || !page) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      // A mostly vertical move is a scroll, not a swipe.
      if (!dragging && dy > 12 && dy > dx) return reset(false);
      if (dx < 8) return;
      dragging = true;
      e.preventDefault();
      page.style.transition = 'none';
      page.style.transform = `translateX(${Math.max(0, dx)}px)`;
      page.style.opacity = String(1 - Math.min(dx / window.innerWidth, 1) * 0.4);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || !page) return;
      const dx = (e.changedTouches[0]?.clientX ?? start.x) - start.x;
      if (dragging && dx > TRIGGER_PX) {
        page.style.transition = `transform 0.22s ${EASE}, opacity 0.22s ${EASE}`;
        page.style.transform = 'translateX(100%)';
        page.style.opacity = '0';
        setTimeout(() => navigate(-1), 160);
        start = null;
        dragging = false;
      } else {
        reset(true);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    const onCancel = () => reset(true);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      reset(false);
    };
  }, [pathname, navigate]);
}
