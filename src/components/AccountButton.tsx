import { Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './Avatar';

/**
 * In the app, your account at the top right of each tab page, like Apple TV and HBO Max: a glass circle with your
 * photo (or a gear in local-only mode) that opens Settings. Part of the page's title row, so it scrolls and swipes with
 * the page. Hidden on the web, where the top bar has the account menu.
 */
export function AccountButton() {
  const { user } = useAuth();
  return (
    <Link to="/settings" className="account-btn" aria-label={user ? 'Account' : 'Settings'} title={user ? 'Account' : 'Settings'}>
      {user ? <Avatar user={user} size={32} /> : <Settings size={20} aria-hidden />}
    </Link>
  );
}

/** A tab page's title row: the title (and anything beside it) on the left, the account button on the right. */
export function PageHead({ children }: { children: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-head-main">{children}</div>
      <AccountButton />
    </div>
  );
}
