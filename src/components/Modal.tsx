import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSwipeToClose } from '../hooks/useSwipeToClose';

// Open dialogs, newest last. Only the top one answers Escape, and the page scrolls again once the last one closes
// (each saving and restoring body overflow would leave it locked when two close together).
const stack: symbol[] = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useSwipeToClose(dialogRef, () => onCloseRef.current());

  useEffect(() => {
    const me = Symbol('modal');
    stack.push(me);
    document.body.style.overflow = 'hidden';
    const returnFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Focus moves into the dialog (unless a field asked for it with autoFocus) and comes back when it closes. Only a
    // button or link gets it, never a text field: that would pop up the phone keyboard uninvited.
    if (dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('.modal-body button:not([disabled]), .modal-body [href]') ?? dialog).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack.at(-1) !== me) return;
      if (e.key === 'Escape') onCloseRef.current();
      // Keep Tab inside the dialog.
      if (e.key === 'Tab' && dialog) {
        const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const [first, last] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (stack.length === 0) document.body.style.overflow = '';
      returnFocus?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
        <span className="sheet-grabber" aria-hidden />
        <div className="modal-head">
          <h3 id={titleId} style={{ fontSize: 22 }}>
            {title}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
