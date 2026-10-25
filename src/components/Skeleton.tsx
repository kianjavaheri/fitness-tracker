/**
 * Gray placeholder blocks shown while a page's data loads (instead of an empty page), shaped roughly like what's
 * coming: an optional title bar, then cards.
 */
export function PageSkeleton({ title = true, cards = 3 }: { title?: boolean; cards?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      {title && <div className="skeleton-block" style={{ width: '45%', height: 30, marginBottom: 22 }} />}
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="skeleton-block" style={{ height: 92, marginBottom: 12, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}
