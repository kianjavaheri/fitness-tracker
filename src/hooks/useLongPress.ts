import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { haptic, prepareHaptic } from '../utils/haptics';

const HOLD_MS = 450;
/** Moving further than this is a scroll, not a hold. */
const SLOP_PX = 10;

/**
 * Press and hold (or right-click) to open something, like iOS's context menus. Spread `bind(item)` on each element;
 * the tap that ends a hold doesn't count as a click, so a card's link or button doesn't also fire.
 */
export function useLongPress<T>(onLongPress: (held: { item: T; anchor: HTMLElement }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  const fire = (item: T, anchor: HTMLElement) => {
    const at = start.current ?? undefined;
    cancel();
    fired.current = true;
    haptic(at);
    onLongPress({ item, anchor });
  };

  return (item: T) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const anchor = e.currentTarget as HTMLElement;
      prepareHaptic();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fire(item, anchor), HOLD_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      // A touch hold that already opened it can also send this (Android); a right-click is followed by no click.
      if (fired.current) return;
      fire(item, e.currentTarget as HTMLElement);
      fired.current = false;
    },
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  });
}
