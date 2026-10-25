import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ContextAction {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  /** Closes the menu itself (or replaces it, e.g. with a dialog). */
  onSelect: () => void;
}

const GAP = 10;
/** The tap that ends a hold can land on the menu as it opens; ignore taps this soon. */
const SETTLE_MS = 350;

/**
 * iOS-style context menu: the held card lifts out over a blurred backdrop with a row of actions next to it (below,
 * or above when it's low on the screen; the card slides up when neither fits). Tapping outside closes it.
 */
export function ContextMenu({ anchor, actions, onClose }: { anchor: HTMLElement; actions: ContextAction[]; onClose: () => void }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(Date.now());
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [rect] = useState(() => anchor.getBoundingClientRect());
  const [layout, setLayout] = useState<{ cardTop: number; menuTop: number; left: number; above: boolean } | null>(null);

  // A copy of the card stands in for it, so the real one can stay put (hidden) underneath.
  useEffect(() => {
    const clone = anchor.cloneNode(true) as HTMLElement;
    clone.removeAttribute('href');
    clone.removeAttribute('id');
    // Outside its grid a link card would be inline, so keep the display it had there.
    const display = getComputedStyle(anchor).display;
    Object.assign(clone.style, { display, margin: '0', width: '100%', height: '100%', transform: 'none', transition: 'none' });
    previewRef.current?.appendChild(clone);
    anchor.style.visibility = 'hidden';
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    return () => {
      clone.remove();
      anchor.style.visibility = '';
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor]);

  useLayoutEffect(() => {
    const menu = menuRef.current?.getBoundingClientRect();
    const safe = safeRef.current?.getBoundingClientRect();
    if (!menu || !safe) return;
    const [top, bottom] = [safe.top, safe.bottom];
    const left = Math.min(Math.max(rect.left, safe.left), safe.right - menu.width);
    let cardTop = Math.min(Math.max(rect.top, top), bottom - rect.height);
    if (cardTop + rect.height + GAP + menu.height <= bottom) {
      setLayout({ cardTop, menuTop: cardTop + rect.height + GAP, left, above: false });
    } else if (cardTop - GAP - menu.height >= top) {
      setLayout({ cardTop, menuTop: cardTop - GAP - menu.height, left, above: true });
    } else {
      cardTop = Math.max(top, bottom - menu.height - GAP - rect.height);
      setLayout({ cardTop, menuTop: Math.min(cardTop + rect.height + GAP, bottom - menu.height), left, above: false });
    }
  }, [rect]);

  const choose = (action: ContextAction) => {
    if (Date.now() - openedAt.current < SETTLE_MS) return;
    action.onSelect();
  };

  return createPortal(
    <div className="ctx-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ctx-safe" ref={safeRef} aria-hidden />
      <div
        className={`ctx-preview${layout ? ' lifted' : ''}`}
        ref={previewRef}
        onPointerDown={onClose}
        style={{ left: rect.left, width: rect.width, height: rect.height, top: layout?.cardTop ?? rect.top }}
        aria-hidden
      />
      <div
        className={`ctx-menu${layout?.above ? ' above' : ''}`}
        ref={menuRef}
        role="menu"
        style={{ top: layout?.menuTop ?? rect.bottom + GAP, left: layout?.left ?? rect.left, visibility: layout ? undefined : 'hidden' }}
      >
        {actions.map((a) => (
          <button key={a.label} className={`ctx-action${a.danger ? ' danger' : ''}`} role="menuitem" onClick={() => choose(a)}>
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
