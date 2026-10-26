import { useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { haptic, prepareHaptic } from '../utils/haptics';

/** How long to hold still before the item lifts (a touch that moves first is a scroll). */
const HOLD_MS = 350;
const SLOP_PX = 8;
/** Near the top or bottom of the screen the page scrolls along, up to this many px a frame. */
const EDGE_PX = 90;
const MAX_SCROLL_PX = 16;
/**
 * Others sliding aside, and the item settling into its slot. An even ease-in-out at about 0.3 s reads as a slide;
 * the app's usual front-loaded curve over 0.2 s looked like the cards popped into place.
 */
export const SLIDE = '280ms cubic-bezier(0.4, 0, 0.2, 1)';
const LIFT = '180ms cubic-bezier(0.4, 0, 0.2, 1)';
const DROP_MS = 280;

interface Drag {
  from: number;
  to: number;
  startY: number;
  startScroll: number;
  /** Page-coordinate box of every item when it lifted. */
  boxes: { top: number; height: number }[];
  /** How far the others move to make room: the lifted item's height plus the gap between items. */
  shift: number;
  /** The drop target (a Superset pill) under the finger: its item's index and element. */
  over: { host: number; el: HTMLElement } | null;
}

/**
 * Press and hold an item, then drag it up or down to a new place, like reordering in iOS. On hold the item lifts
 * (with a haptic), the others slide aside as it passes them, and letting go calls `onMove(from, to)`.
 *
 * Give each item `ref={itemRef(i)}` and spread `handle(i)` on the part that's held (add the `holdable` class there so
 * iOS doesn't select text or preview links). While an item is lifted the page doesn't scroll by touch; it scrolls by
 * itself near the screen edges, so an item can go anywhere in a long list.
 *
 * With `onDropOn`, elements marked `data-superset-drop={index}` are drop targets: held over one, it gets the
 * `drop-over` class and the list stops rearranging (so the target holds still); letting go there calls
 * `onDropOn(from, index)` instead of moving.
 */
export function useDragReorder(count: number, onMove: (from: number, to: number) => void, onDropOn?: (from: number, host: number) => void) {
  const items = useRef<(HTMLElement | null)[]>([]);
  const onMoveRef = useRef(onMove);
  const onDropOnRef = useRef(onDropOn);
  useLayoutEffect(() => {
    onMoveRef.current = onMove;
    onDropOnRef.current = onDropOn;
  });
  const drag = useRef<Drag | null>(null);
  /** Ends whatever press is in progress (removes its listeners, timers and styles). */
  const end = useRef<() => void>(() => {});
  /** The click that ends a drag mustn't also open the link or press the button that was held. */
  const justDragged = useRef(false);

  useEffect(() => () => end.current(), []);

  const itemRef = (i: number) => (el: HTMLElement | null) => {
    items.current[i] = el;
  };

  const startPress = (i: number, e: PointerEvent) => {
    if (e.button !== 0 || drag.current) return;
    if ((e.target as Element).closest('input, textarea, select')) return;
    end.current();
    justDragged.current = false;
    const start = { x: e.clientX, y: e.clientY };
    prepareHaptic();

    let frame = 0;
    let lastY = start.y;
    let lastX = start.x;
    const els = () => items.current.slice(0, count);
    const mid = (b: { top: number; height: number }) => b.top + b.height / 2;

    /** Puts the lifted item under the finger and the others where they make room for it. */
    const place = () => {
      const d = drag.current;
      if (!d) return;
      const dy = lastY - d.startY + (window.scrollY - d.startScroll);
      const lifted = els()[d.from];
      if (lifted) lifted.style.transform = `translate3d(0, ${dy}px, 0) scale(1.02)`;
      if (onDropOnRef.current && hover(lifted)) return;
      const centre = mid(d.boxes[d.from]) + dy;
      let to = d.from;
      for (let j = d.from + 1; j < d.boxes.length; j++) if (centre > mid(d.boxes[j])) to = j;
      for (let j = d.from - 1; j >= 0; j--) if (centre < mid(d.boxes[j])) to = j;
      if (to === d.to) return;
      d.to = to;
      els().forEach((el, j) => {
        if (!el || j === d.from) return;
        const offset = d.from < j && j <= to ? -d.shift : to <= j && j < d.from ? d.shift : 0;
        el.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : '';
      });
    };

    /** Marks the drop target under the finger, if any (a little slack around it); true while over one. */
    const hover = (lifted: HTMLElement | null | undefined) => {
      const d = drag.current;
      if (!d) return false;
      const SLACK = 14;
      let found: Drag['over'] = null;
      for (const el of document.querySelectorAll<HTMLElement>('[data-superset-drop]')) {
        const host = Number(el.dataset.supersetDrop);
        if (host === d.from || lifted?.contains(el)) continue;
        const r = el.getBoundingClientRect();
        if (lastX >= r.left - SLACK && lastX <= r.right + SLACK && lastY >= r.top - SLACK && lastY <= r.bottom + SLACK) {
          found = { host, el };
          break;
        }
      }
      if (found?.el !== d.over?.el) {
        d.over?.el.classList.remove('drop-over');
        found?.el.classList.add('drop-over');
        lifted?.classList.toggle('drop-ready', !!found);
        if (found) haptic(undefined, 'light');
      }
      d.over = found;
      return !!found;
    };

    /** Scrolls when the finger is near the top or bottom, faster the closer it is. */
    const autoScroll = () => {
      frame = requestAnimationFrame(autoScroll);
      const up = EDGE_PX - lastY;
      const down = lastY - (window.innerHeight - EDGE_PX);
      const speed = up > 0 ? -Math.min(1, up / EDGE_PX) : down > 0 ? Math.min(1, down / EDGE_PX) : 0;
      if (!speed) return;
      window.scrollBy(0, speed * MAX_SCROLL_PX);
      place();
    };

    const lift = () => {
      const all = els();
      const el = all[i];
      if (!el) return;
      const boxes = all.map((item) => {
        const r = item?.getBoundingClientRect();
        return { top: (r?.top ?? 0) + window.scrollY, height: r?.height ?? 0 };
      });
      const neighbour = boxes[i + 1] ?? boxes[i - 1];
      const gap = neighbour ? Math.max(0, neighbour.top > boxes[i].top ? neighbour.top - (boxes[i].top + boxes[i].height) : boxes[i].top - (neighbour.top + neighbour.height)) : 0;
      drag.current = { from: i, to: i, startY: lastY, startScroll: window.scrollY, boxes, shift: boxes[i].height + gap, over: null };
      all.forEach((item, j) => {
        if (!item) return;
        item.style.transition = j === i ? `transform ${LIFT}, box-shadow ${LIFT}` : `transform ${SLIDE}`;
      });
      el.classList.add('drag-lifted');
      el.style.transform = 'scale(1.02)';
      justDragged.current = true;
      haptic(start);
      // From here on it follows the finger directly.
      requestAnimationFrame(() => {
        if (drag.current && el) el.style.transition = `box-shadow ${LIFT}`;
      });
      frame = requestAnimationFrame(autoScroll);
    };
    const timer = setTimeout(lift, HOLD_MS);

    const onPointerMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      lastY = ev.clientY;
      lastX = ev.clientX;
      if (!drag.current) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > SLOP_PX) finish(false); // a scroll
        return;
      }
      place();
    };
    // While lifted, touch moves drag the item instead of scrolling the page.
    const onTouchMove = (ev: TouchEvent) => {
      if (drag.current) ev.preventDefault();
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === e.pointerId) finish(true);
    };
    const onCancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === e.pointerId) finish(false);
    };

    /** Lets go: drops the item in its new place (`commit`) or puts everything back. */
    const finish = (commit: boolean) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchmove', onTouchMove);
      end.current = () => {};
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const lifted = els()[d.from];
      // Its top as if unscaled (scale(1.02) grows it 1% each way from the centre).
      const box = lifted?.getBoundingClientRect();
      const releasedTop = box ? box.top + (box.height * 0.01) / 1.02 : 0;
      // Back to no offsets with transitions off, settled (the reflow) before the list re-renders: with the cards' own
      // transition on, clearing an offset as the card moved to its new place made it jump past and slide back.
      const all = els().filter((el): el is HTMLElement => !!el);
      for (const el of all) {
        el.style.transition = 'none';
        el.style.transform = '';
        el.classList.remove('drag-lifted', 'drop-ready');
      }
      void document.body.offsetHeight;
      d.over?.el.classList.remove('drop-over');
      const dropOn = commit && d.over ? d.over.host : null;
      const to = commit && dropOn == null ? d.to : d.from;
      if (dropOn != null) onDropOnRef.current?.(d.from, dropOn);
      else if (to !== d.from) onMoveRef.current(d.from, to);
      // Once the list has re-rendered in its new order (before the next paint), glide the item from where it was let
      // go into its slot.
      requestAnimationFrame(() => {
        for (const other of all) if (other.isConnected) other.style.transition = '';
        // The same item wherever it ended up: found by its data-slot-id when it's been redrawn in another list (into or
        // out of a superset), else the element React kept.
        const id = lifted?.dataset.slotId;
        const el = (id && document.querySelector<HTMLElement>(`[data-slot-id="${id}"]`)) || (lifted?.isConnected ? lifted : items.current[to]);
        if (!el?.isConnected) return;
        const delta = releasedTop - el.getBoundingClientRect().top;
        el.style.transition = 'none';
        // From where it was let go, still slightly enlarged, down into its slot.
        el.style.transform = `translate3d(0, ${delta}px, 0) scale(1.02)`;
        void el.offsetHeight;
        el.style.transition = `transform ${SLIDE}`;
        el.style.transform = '';
        setTimeout(() => {
          el.style.transition = '';
        }, DROP_MS);
      });
      setTimeout(() => {
        justDragged.current = false;
      }, 400);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    end.current = () => finish(false);
  };

  const handle = (i: number) => ({
    onPointerDown: (e: PointerEvent) => startPress(i, e),
    onClickCapture: (e: MouseEvent) => {
      if (!justDragged.current) return;
      justDragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  });

  return { itemRef, handle };
}
