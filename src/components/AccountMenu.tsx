import { LogOut, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './Avatar';

/** Navbar avatar that opens a small menu: who's signed in, Settings, Sign out. */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape (menu items close it themselves).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="account-menu" ref={ref}>
      <button
        className="nav-link icon account-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title={user.email ?? 'Account'}
      >
        <Avatar user={user} size={34} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name ?? 'Signed in'}</div>
            <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.email}
            </div>
          </div>
          <Link to="/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={15} /> Settings
          </Link>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
