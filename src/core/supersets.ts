// Supersets are stored as a "linked with the next one" flag on each exercise in a workout or session, so a group is a
// run of consecutive items. These helpers keep that consistent when items move or go away.

type Linkable = { supersetNext?: boolean };

/** Consecutive runs of linked items (a single item is a group of one), with each item's index. */
export function supersetGroups<T extends Linkable>(items: T[]): { item: T; index: number }[][] {
  const groups: { item: T; index: number }[][] = [];
  items.forEach((item, index) => {
    if (index > 0 && items[index - 1].supersetNext) groups[groups.length - 1].push({ item, index });
    else groups.push([{ item, index }]);
  });
  return groups;
}

/** Whether checking off a set here should start the rest timer: only after the last exercise of a superset. */
export function restsAfter(items: Linkable[], index: number): boolean {
  return !items[index]?.supersetNext;
}

/** Moving an item drops its links (and the one pointing at it), so a superset never silently re-forms. */
export function moveUnlinked<T extends Linkable>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.map((item, i) => (i === from || i === from - 1 ? { ...item, supersetNext: false } : item));
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((item, i) => (i === to - 1 ? { ...item, supersetNext: false } : item));
}

/** Removing an item keeps the rest of its superset together only if it sat in the middle of one. */
export function removeUnlinked<T extends Linkable>(items: T[], index: number): T[] {
  const removed = items[index];
  return items
    .map((item, i) => (i === index - 1 ? { ...item, supersetNext: !!item.supersetNext && !!removed.supersetNext } : item))
    .filter((_, i) => i !== index);
}

/** Last item's link is meaningless (nothing follows it). */
export function toggleLink<T extends Linkable>(items: T[], index: number): T[] {
  return items.map((item, i) => (i === index ? { ...item, supersetNext: !item.supersetNext } : item));
}
