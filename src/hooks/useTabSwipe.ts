import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NEED_TAB_EVENT } from '../components/TabPager';
import { TAB_PATHS } from '../pages/tabPages';

/** Each tab's slot in the bottom bar (Check in, behind the +, is slot 2), for the sliding highlight. */
const TAB_SLOTS = [0, 1, 2, 3, 4];

/** The + sits in slot 2: there the highlight becomes a circle just bigger than it (a thin ring around the +). */
const CHECK_IN_SLOT = 2;

/** Puts the highlight at a (possibly fractional) slot; `--c` is how close it is to the + (1 = a ring around it). */
function placeIndicator(bar: HTMLElement, slot: number) {
  bar.style.setProperty('--i', String(slot));
  bar.style.setProperty('--c', String(Math.max(0, 1 - Math.abs(slot - CHECK_IN_SLOT))));
}

/**
 * The settle after letting go, measured from Apple's Health app: it keeps the finger's speed for about 100 ms, then
 * eases out over roughly 450 ms in all. This curve starts at about 0.8 / 0.3 of its average speed (a sharper one,
 * 1 / 0.22, matched the finger only by finishing in ~350 ms, which felt abrupt).
 */
const EASE = 'cubic-bezier(0.3, 0.8, 0.3, 1)';
const EASE_START_SLOPE = 0.8 / 0.3;
/** Settle time bounds: a flick still eases out, a slow release doesn't drag on. */
const MIN_MS = 220;
const MAX_MS = 600;
/** Released (nearly) still: settle as if moving this fast (px/ms), so a page put back doesn't linger part-way. */
const MIN_SPEED = 0.3;

/** Drag at least this far, or flick, to change tab. */
const TRIGGER_PX = 70;
const FLICK_PX_PER_MS = 0.5;
/** A flick this short still changes tab. */
const FLICK_MIN_PX = 24;

/** Navigation state of a tab reached by swiping: it's already in place, so it gets no entrance. */
export interface SwipeState {
  swiped: true;
}

/** Elements a sideways drag belongs to: form fields, charts (scrubbing), dialogs, and anything that scrolls sideways. */
function ownsHorizontalDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, .recharts-wrapper, .overlay, .ctx-overlay, [data-no-swipe]')) return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/**
 * How long to take over `distance` px so the motion starts at the finger's speed (`velocity`, px/ms) and eases out:
 * the release carries straight on instead of restarting.
 */
function settleMs(distance: number, velocity: number) {
  if (distance < 1) return MIN_MS;
  const ms = (EASE_START_SLOPE * distance) / Math.max(Math.abs(velocity), MIN_SPEED);
  return Math.min(MAX_MS, Math.max(MIN_MS, ms));
}


/** The tab page on screen (TabPager draws the others parked as .swipe-peek). */
const currentPage = () => document.querySelector<HTMLElement>('main.tab-page:not(.swipe-peek)');

/**
 * Swipe left/right on Home, Workouts, Analytics and Account to move to the next tab, like a pager (Health app style).
 * TabPager keeps the neighbouring tabs drawn and parked off screen; this moves the current page and the neighbour
 * together with the finger (once per frame, on GPU layers) and slides the tab bar's highlight along. On release both
 * carry on at the finger's speed and ease to rest; once the neighbour is in place the route changes, which only swaps
 * which page is current (no rebuild). A mostly vertical move stays a scroll. Only in the installed app.
 *
 * The listeners are attached once and read the current tab from the page itself, not from the route: the router
 * commits a navigation as a React transition, a moment after it's asked for, and a swipe that started in between used
 * to move the old (already off screen) page and leave pages stuck part-way. Until the swiped-to page is current, new
 * swipes wait.
 */
export function useTabSwipe() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    if (!document.documentElement.classList.contains('standalone')) return;
    let start: { x: number; y: number } | null = null;
    let target: EventTarget | null = null;
    let page: HTMLElement | null = null;
    let index = -1;
    let next = -1;
    let width = 0;
    /** Where the finger puts the page, and where it was last drawn (what's on screen). */
    let x = 0;
    let drawnX = 0;
    let dragging = false;
    let settling = false;
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let samples: { x: number; t: number }[] = [];
    /** The page's offset when this touch began (non-zero when it caught a settle part-way). */
    let base = 0;
    /** Whether this touch's start has been checked against elements that own sideways drags. */
    let checked = false;
    /** A finished swipe's tab, until the router has made it current (or this long has passed). */
    let pending: { path: string; until: number } | null = null;

    const neighbour = () => (next >= 0 ? document.querySelector<HTMLElement>(`main.tab-page[data-tab="${TAB_PATHS[next]}"]`) : null);
    const indicator = () => document.querySelector<HTMLElement>('.tab-indicator');

    /** Writes the current positions: page, neighbour beside it, and the highlight part-way between their tabs. */
    const draw = () => {
      frame = 0;
      drawnX = x;
      if (page) page.style.transform = `translate3d(${x}px, 0, 0)`;
      const n = neighbour();
      if (n) n.style.transform = `translate3d(${x + (next > index ? width : -width)}px, 0, 0)`;
      const bar = indicator();
      if (bar && next >= 0) {
        const progress = Math.min(1, Math.abs(x) / width);
        placeIndicator(bar, TAB_SLOTS[index] + (TAB_SLOTS[next] - TAB_SLOTS[index]) * progress);
        markTab(progress > 0.5 ? next : index);
      }
    };
    /**
     * Lights the tab whose page is mostly on screen, as the drag crosses halfway, instead of when the route changes
     * after the settle. React sets the same classes once it does.
     */
    const markTab = (tab: number) => {
      const tabs = document.querySelectorAll('.tabbar-inner > .tab');
      tabs.forEach((el, i) => {
        // The + is a link inside its slot; it turns (its "active" look) on Check in.
        const target = el.tagName === 'A' ? el : el.querySelector('.tab-checkin');
        target?.classList.toggle('active', i === TAB_SLOTS[tab]);
      });
    };
    const setTransition = (value: string) => {
      for (const el of [page, neighbour(), indicator()]) if (el) el.style.transition = value;
    };

    /** Eases everything from where it is on screen to page offset `toX`, then calls `done`. */
    const settleTo = (toX: number, velocity: number, done: () => void) => {
      // A move that arrived after the last frame was never drawn: the ease starts from what's on screen, and covers
      // that bit too, rather than jumping it in the first frame.
      cancelAnimationFrame(frame);
      frame = 0;
      settling = true;
      const ms = settleMs(Math.abs(toX - drawnX), velocity);
      setTransition(`transform ${ms}ms ${EASE}, clip-path ${ms}ms ${EASE}, top ${ms}ms ${EASE}, bottom ${ms}ms ${EASE}`);
      x = toX;
      draw();
      settleTimer = setTimeout(() => {
        settling = false;
        done();
      }, ms + 20);
    };
    /** Back to rest without changing tab: the page in place, the neighbour parked, the highlight on this tab. */
    const restore = () => {
      for (const el of [page, neighbour()]) {
        if (!el) continue;
        el.style.transition = '';
        el.style.transform = '';
      }
      const bar = indicator();
      if (bar) {
        bar.style.transition = '';
        if (index >= 0) placeIndicator(bar, TAB_SLOTS[index]);
      }
      if (index >= 0) markTab(index);
    };

    /** Points the drag at the tab on the side the page has moved to (it can reverse), parking the one it was showing. */
    const aim = (pos: number) => {
      const to = index + (pos < 0 ? 1 : -1);
      const want = to >= 0 && to < TAB_PATHS.length ? to : -1;
      if (want === next) return;
      const old = neighbour();
      if (old) {
        old.style.transition = '';
        old.style.transform = '';
      }
      next = want;
      const n = neighbour();
      if (n) n.style.transition = 'none';
      // Normally already drawn (TabPager, in idle time); if the swipe beat it, draw it now.
      else if (next >= 0) window.dispatchEvent(new CustomEvent(NEED_TAB_EVENT, { detail: TAB_PATHS[next] }));
    };

    /**
     * The rest of a touch is followed on the element it started on, not the document: if a re-render removes that
     * element mid-drag, its events stop reaching the document, and the swipe froze part-way with the neighbour
     * peeking in.
     */
    let followed: EventTarget | null = null;
    const follow = (el: EventTarget | null) => {
      if (followed) {
        followed.removeEventListener('touchmove', onMove as EventListener);
        followed.removeEventListener('touchend', onEnd as EventListener);
        followed.removeEventListener('touchcancel', onCancel);
      }
      followed = el;
      if (el) {
        el.addEventListener('touchmove', onMove as EventListener, { passive: false });
        el.addEventListener('touchend', onEnd as EventListener);
        el.addEventListener('touchcancel', onCancel);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (settling && page) {
        // Caught while easing to rest, like a native pager: it stops where it is and follows the finger from there,
        // so a quick second swipe isn't lost (it used to be ignored until the first one finished).
        clearTimeout(settleTimer);
        settling = false;
        x = new DOMMatrix(getComputedStyle(page).transform).m41;
        setTransition('none');
        draw();
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY };
        base = next >= 0 ? x : x * 4; // at an edge the page moves a quarter of the finger
        target = e.target;
        checked = true;
        dragging = true;
        samples = [{ x: t.clientX, t: e.timeStamp }];
        follow(e.target);
        return;
      }
      if (settling) return;
      if (dragging) {
        // The last drag's end never arrived (iOS can drop it): put everything back rather than leave it part-way.
        follow(null);
        start = null;
        dragging = false;
        settleTo(0, 0, restore);
        return;
      }
      const current = currentPage();
      if (pending) {
        if (current?.dataset.tab !== pending.path && performance.now() < pending.until) return;
        pending = null;
      }
      index = TAB_PATHS.indexOf(current?.dataset.tab ?? '');
      if (!current || index < 0) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      base = 0;
      target = e.target;
      checked = false;
      samples = [{ x: t.clientX, t: e.timeStamp }];
      page = current;
      follow(e.target);
    };
    function onMove(e: TouchEvent) {
      if (!start || !page) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (!dragging) {
        const adx = Math.abs(dx);
        if (!checked) {
          checked = true;
          // Checked once per touch: it reads computed styles up the tree.
          if (ownsHorizontalDrag(target)) {
            start = null;
            return;
          }
        }
        // Once iOS's own pan starts it cancels the touch (the swipe moved a little, then snapped back), so while
        // undecided, moves that lean sideways are kept from starting a scroll. Not the first px or two: a scroll's
        // jitter there can lean either way.
        const moved = Math.max(adx, dy);
        if (moved >= 3 && adx >= dy) e.preventDefault();
        // A thumb swipes in an arc, often 30–45° off level and rising more steeply at first, while scrolls are nearly
        // vertical. So after 10px anything flatter than about 55° is a swipe and anything steeper than about 63° a
        // scroll; in between it waits for 24px and goes by the overall angle. (It used to need under 34° throughout,
        // and a first few px leaning up made it a scroll: many swipes never caught.)
        if (moved < 10) return;
        if (adx <= dy * 0.7) {
          if (dy < adx * 2 && moved < 24) return;
          start = null; // a scroll
          return;
        }
        dragging = true;
        clearTimeout(settleTimer);
        next = -1;
        width = page.getBoundingClientRect().width;
        drawnX = 0;
        setTransition('none');
      }
      e.preventDefault();
      // Where the finger puts the page: from rest, or from where a settle was caught. Never past a whole page.
      const pos = Math.max(-width, Math.min(width, base + dx));
      aim(pos);
      samples.push({ x: t.clientX, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
      // No tab that way: move only a little, so it feels like an edge.
      x = next >= 0 ? pos : pos / 4;
      // One write per frame, however many touch events arrive.
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function onEnd(e: TouchEvent) {
      follow(null);
      if (!start || !page || !dragging) {
        start = null;
        return;
      }
      const end = e.changedTouches[0]?.clientX ?? start.x;
      const pos = base + end - start.x;
      const first = samples[0];
      const velocity = first && e.timeStamp > first.t ? (end - first.x) / (e.timeStamp - first.t) : 0;
      // A flick decides by its direction (towards the neighbour, or back); a slow release by how far the page is.
      const flick = Math.abs(velocity) > FLICK_PX_PER_MS;
      const go = flick ? Math.sign(velocity) === Math.sign(pos) && Math.abs(pos) > FLICK_MIN_PX : Math.abs(pos) > TRIGGER_PX;
      start = null;
      dragging = false;

      if (next >= 0 && neighbour() && go) {
        // Carry on to the neighbour: page fully off, neighbour at rest where the page was, highlight on its tab.
        const path = TAB_PATHS[next];
        settleTo(next > index ? -width : width, velocity, () => {
          const bar = indicator();
          if (bar) bar.style.transition = '';
          window.scrollTo(0, 0); // the neighbour shows its top; the old page is off screen, so this isn't seen
          pending = { path, until: performance.now() + 1500 };
          const state: SwipeState = { swiped: true };
          navigateRef.current(path, { state });
        });
      } else {
        settleTo(0, velocity, restore);
      }
    }
    function onCancel() {
      follow(null);
      if (!dragging) {
        start = null;
        return;
      }
      start = null;
      dragging = false;
      settleTo(0, 0, restore);
    }

    document.addEventListener('touchstart', onStart, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      follow(null);
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      if (dragging || settling) restore();
    };
  }, []);
}
