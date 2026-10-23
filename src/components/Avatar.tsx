import type { AccountUser } from '../auth/AuthProvider';

/** Google profile photo, or the first letter of the name/email when there isn't one. */
export function Avatar({ user, size = 32 }: { user: AccountUser; size?: number }) {
  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: '50%', flexShrink: 0 }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(user.name ?? user.email ?? '?')[0].toUpperCase()}
    </span>
  );
}
