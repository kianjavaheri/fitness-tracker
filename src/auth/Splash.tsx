import { useEffect, useState } from 'react';

/**
 * Shown while the saved sign-in is restored. Stays blank for a moment first, so returning
 * users (restored in a few milliseconds) don't see it flash.
 */
export function Splash({ message, immediate = false }: { message?: string; immediate?: boolean }) {
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, [immediate]);

  if (!visible) return null;
  return (
    <div className="splash" role="status" aria-live="polite">
      <img src="/favicon.svg" alt="" width={56} height={56} className="splash-mark" />
      {message && <div className="muted small">{message}</div>}
    </div>
  );
}
