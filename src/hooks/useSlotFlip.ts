import { useLayoutEffect, useRef } from 'react';
import { SLIDE } from './useDragReorder';

/**
 * Animates exercises to their new places when a change moves them (into or out of a superset): call the returned
 * `capture()` just before the change; on the next render every element with `data-slot-id` slides from where it was.
 * By id rather than element, because moving into or out of a superset draws the card again in another list.
 */
export function useSlotFlip() {
  const before = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    const tops = before.current;
    if (!tops) return;
    before.current = null;
    for (const el of document.querySelectorAll<HTMLElement>('[data-slot-id]')) {
      const was = tops.get(el.dataset.slotId ?? '');
      if (was == null) continue;
      const delta = was - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = `translate3d(0, ${delta}px, 0)`;
      void el.offsetHeight;
      el.style.transition = `transform ${SLIDE}`;
      el.style.transform = '';
      el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true });
    }
  });

  return () => {
    before.current = new Map(
      [...document.querySelectorAll<HTMLElement>('[data-slot-id]')].map((el) => [el.dataset.slotId ?? '', el.getBoundingClientRect().top]),
    );
  };
}
