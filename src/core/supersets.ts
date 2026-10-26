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

/** First and last index of the superset `index` is in (both `index` for an exercise on its own). */
export function groupBounds(items: Linkable[], index: number): [number, number] {
  let start = index;
  while (start > 0 && items[start - 1].supersetNext) start--;
  let end = index;
  while (end < items.length - 1 && items[end].supersetNext) end++;
  return [start, end];
}

/**
 * Moves `mover` into `host`'s superset: just after the last exercise of it (or after `host` itself, making a new pair),
 * linked on. If `mover` was in another superset, the rest of that one stays together.
 */
export function moveIntoSuperset<T extends Linkable>(items: T[], mover: number, host: number): T[] {
  if (mover === host) return items;
  const moved = items[mover];
  const rest = removeUnlinked(items, mover);
  const [, end] = groupBounds(rest, host > mover ? host - 1 : host);
  return [...rest.slice(0, end), { ...rest[end], supersetNext: true }, { ...moved, supersetNext: false }, ...rest.slice(end + 1)];
}

/**
 * Takes `index` out of its superset. The first or last one just unlinks where it is; one from the middle moves to
 * just after what's left of the group (which stays together).
 */
export function leaveSuperset<T extends Linkable>(items: T[], index: number): T[] {
  const [start, end] = groupBounds(items, index);
  if (start === end) return items;
  if (index === start) return items.map((item, i) => (i === index ? { ...item, supersetNext: false } : item));
  if (index === end) return items.map((item, i) => (i === index - 1 ? { ...item, supersetNext: false } : item));
  const rest = removeUnlinked(items, index);
  return [...rest.slice(0, end), { ...items[index], supersetNext: false }, ...rest.slice(end)];
}

/**
 * Supersets `host` with an exercise picked from search: that exercise's slot if the list already has it (outside
 * host's superset), else a new one from `create`, which joins at the end of host's superset.
 */
export function supersetWith<T extends Linkable & { exerciseId: string }>(items: T[], host: number, exerciseId: string, create: () => T): T[] {
  const [start, end] = groupBounds(items, host);
  const existing = items.findIndex((item, i) => item.exerciseId === exerciseId && (i < start || i > end));
  if (existing >= 0) return moveIntoSuperset(items, existing, host);
  return moveIntoSuperset([...items, create()], items.length, host);
}

/** The order and links as `before` recorded them (an Undo), keeping each item's current contents. */
export function restoreLinks<T extends Linkable & { id: string }>(items: T[], before: { id: string; supersetNext?: boolean }[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const restored = before.flatMap(({ id, supersetNext }) => {
    const item = byId.get(id);
    return item ? [{ ...item, supersetNext }] : [];
  });
  return [...restored, ...items.filter((item) => !before.some((b) => b.id === item.id))];
}

/**
 * Puts an exercise that's on its own back after `anchorId` (or first, for null), past the end of any superset the
 * anchor is in: where it was before being pulled into a superset. Unchanged if it's still linked or the anchor's gone.
 */
export function placeAfter<T extends Linkable & { id: string }>(items: T[], index: number, anchorId: string | null): T[] {
  const item = items[index];
  if (!item || item.supersetNext || items[index - 1]?.supersetNext) return items;
  const rest = items.filter((_, i) => i !== index);
  if (anchorId == null) return [item, ...rest];
  const at = rest.findIndex((x) => x.id === anchorId);
  if (at < 0) return items;
  const [, end] = groupBounds(rest, at);
  return [...rest.slice(0, end + 1), item, ...rest.slice(end + 1)];
}
