// Fuzzy matching of exercise names, so "Rear Delt Cable Fly" is recognised as
// "Cable Rear Delt Fly" and "Tricep Pushdown" as "Triceps Pushdown".

const SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ez: 'ez',
  ohp: 'overhead press',
  rdl: 'romanian deadlift',
  bw: 'bodyweight',
  pullup: 'pull up',
  pushup: 'push up',
  chinup: 'chin up',
  situp: 'sit up',
  flye: 'fly',
  flyes: 'fly',
  flies: 'fly',
};

const STOPWORDS = new Set(['a', 'an', 'and', 'the', 'with', 'on', 'of', 'to', 'for', 'in']);

function singular(word: string) {
  if (word.length > 3 && word.endsWith('es') && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Normalized set of meaningful words in an exercise name. */
export function nameTokens(name: string): Set<string> {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYMS[w] ?? w).split(' '))
    .filter((w) => !STOPWORDS.has(w))
    .map(singular);
  return new Set(words);
}

/** 0–1 similarity between two exercise names (Jaccard overlap of normalized words). */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * Candidates that look like the same exercise as `name`, best first. A candidate qualifies when
 * most words overlap, or when every word of `name` appears in it (e.g. "Leg Curl" → "Seated Leg Curl").
 */
export function findSimilar<T extends { name: string }>(name: string, candidates: T[], limit = 4): T[] {
  const mine = nameTokens(name);
  if (mine.size === 0) return [];
  return candidates
    .map((c) => {
      const score = nameSimilarity(name, c.name);
      const theirs = nameTokens(c.name);
      const contained = mine.size >= 2 && [...mine].every((t) => theirs.has(t));
      return { c, score, ok: score >= 0.6 || (contained && score >= 0.4) };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Candidates with the same meaningful words as `name` (order, plurals and abbreviations aside). */
export function findEquivalent<T extends { name: string }>(name: string, candidates: T[]): T[] {
  return candidates.filter((c) => nameSimilarity(name, c.name) === 1);
}

/**
 * Candidates whose name contains every word of `name`, shortest first. Catches one-word
 * entries like "Squats" → "Back Squat" that are too short for a confident similarity score.
 */
export function findContaining<T extends { name: string }>(name: string, candidates: T[], limit = 3): T[] {
  const mine = nameTokens(name);
  if (mine.size === 0) return [];
  return candidates
    .map((c) => ({ c, tokens: nameTokens(c.name) }))
    .filter(({ tokens }) => [...mine].every((t) => tokens.has(t)))
    .sort((a, b) => a.tokens.size - b.tokens.size)
    .slice(0, limit)
    .map((x) => x.c);
}
