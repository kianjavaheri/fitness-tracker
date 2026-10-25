import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button, for things that can't be undone. */
  danger?: boolean;
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface FeedbackValue {
  /** In-app replacement for confirm(): resolves true when the confirm button is chosen. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A short banner; with `undo`, it offers to reverse what just happened (instead of asking first). */
  notify: (message: string, options?: { undo?: () => void }) => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);
const TOAST_MS = 5000;

/**
 * Confirmation dialogs and undo banners, used instead of the browser's confirm()/alert() (which on iOS show the site
 * address and an ambiguous Cancel/OK). Deletes act at once and offer Undo; only things that can't be undone ask first.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsking({ ...options, resolve })),
    [],
  );

  const notify = useCallback((message: string, options?: { undo?: () => void }) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo: options?.undo });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const answer = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, notify }}>
      {children}
      {asking && (
        <Modal title={asking.title} onClose={() => answer(false)}>
          {asking.message && <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{asking.message}</div>}
          <div className="row-wrap" style={{ justifyContent: 'flex-end', marginTop: 18, gap: 8 }}>
            <button className="btn btn-sm" onClick={() => answer(false)}>
              {asking.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`btn btn-sm${asking.danger ? '' : ' btn-primary'}`}
              style={asking.danger ? { background: 'var(--danger)', color: 'var(--page-base)' } : undefined}
              onClick={() => answer(true)}
            >
              {asking.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div key={toast.id} className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
