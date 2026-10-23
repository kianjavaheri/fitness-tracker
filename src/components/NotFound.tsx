import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="empty">
      This item no longer exists.{' '}
      <Link to="/" className="link-cta" style={{ fontSize: 12, marginLeft: 8 }}>
        Go home
      </Link>
    </div>
  );
}
