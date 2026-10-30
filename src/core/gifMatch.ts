// Matching exercise names to ExerciseDB's (for its anatomical GIFs; see USE_ANATOMICAL in data/catalog.ts). Used
// ahead of time for the library (scripts/match-exercise-gifs.mjs) and in the app for exercises you named yourself.

/** One ExerciseDB exercise: its id, name and equipment (e.g. "leverage machine"). */
export type GifCandidate = [id: string, name: string, equipments: string[]];

// Spellings that differ between datasets (and how people type them), applied to whole words after lowercasing.
const WORDS: Record<string, string> = {
  pullups: 'pull up', pullup: 'pull up', pushups: 'push up', pushup: 'push up', chinup: 'chin up', chinups: 'chin up',
  situp: 'sit up', situps: 'sit up', db: 'dumbbell', dumbbells: 'dumbbell', bb: 'barbell', tricep: 'triceps',
  bicep: 'biceps', kettlebells: 'kettlebell', bands: 'band', lats: 'lat',
  flyes: 'fly', flys: 'fly', flye: 'fly', extensions: 'extension', raises: 'raise', curls: 'curl', rows: 'row',
  presses: 'press', squats: 'squat', lunges: 'lunge', dips: 'dip', crunches: 'crunch', shrugs: 'shrug',
  deadlifts: 'deadlift', pulldowns: 'pulldown', pushdowns: 'pushdown', kickbacks: 'kickback', thrusts: 'thrust',
  bridges: 'bridge', twists: 'twist', lever: 'machine', leverage: 'machine', military: 'overhead',
};
// Words that say little about which exercise it is (a "flat" "bench" is the default for presses).
const FILLER = new Set(['the', 'with', 'on', 'a', 'to', 'and', 'of', 'version', 'medium', 'grip', 'exercise', 'v', 'flat', 'bench']);

// Words that make it a different exercise (or variant) when only one side has them.
const DISTINCT = new Set([
  'jump', 'jumping', 'twist', 'twisting', 'single', 'one', 'alternate', 'alternating', 'reverse', 'decline', 'incline',
  'close', 'wide', 'narrow', 'pistol', 'kneeling', 'sumo', 'zercher', 'front', 'side', 'behind', 'rear', 'hack',
  'sissy', 'smith', 'band', 'ball', 'stability', 'weighted', 'assisted', 'lying', 'seated', 'standing', 'pull',
  'biceps', 'triceps', 'calf', 'knees', 'step', 'lunge', 'squat', 'curl', 'press', 'row', 'raise', 'stretch',
  'inverse', 'self', 'pov', 'fly',
]);

export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/pull-?ups?/g, 'pull up')
    .replace(/push-?ups?/g, 'push up')
    .replace(/chin-?ups?/g, 'chin up')
    .replace(/sit-?ups?/g, 'sit up')
    .replace(/e-?z[ -]?(curl )?bar/g, 'ez barbell')
    // A brand of plate-loaded machines.
    .replace(/hammer strength/g, 'machine')
    .replace(/rear delt(oid)? fl(y|yes?|ies)/g, 'reverse fly')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (WORDS[w] ?? w).split(' '))
    .filter((w) => !FILLER.has(w));
}

// The library's equipment names (and words in a name) → ExerciseDB's.
const EQUIPMENT: Record<string, string[]> = {
  barbell: ['barbell', 'olympic barbell'],
  dumbbell: ['dumbbell'],
  cable: ['cable'],
  machine: ['leverage machine', 'smith machine', 'sled machine', 'assisted'],
  smith: ['smith machine'],
  kettlebell: ['kettlebell'],
  kettlebells: ['kettlebell'],
  band: ['band', 'resistance band'],
  bands: ['band', 'resistance band'],
  'e-z curl bar': ['ez barbell'],
  ez: ['ez barbell'],
  'medicine ball': ['medicine ball'],
  'exercise ball': ['stability ball'],
  'foam roll': ['roller'],
};

/**
 * What equipment ExerciseDB should list for it: the library's own field, else a word in the name ("Machine Crunch",
 * "DB Press"); bodyweight library exercises with none listed are body weight. Empty when unknown.
 */
export function equipmentFor(name: string, equipment: string | undefined, bodyweight: boolean): string[] {
  if (equipment) return EQUIPMENT[equipment] ?? [];
  const named = nameWords(name).find((w) => EQUIPMENT[w]);
  if (named) return EQUIPMENT[named];
  return bodyweight ? ['body weight', 'bodyweight'] : [];
}

const wordCache = new Map<string, Set<string>>();
const wordsOf = (name: string) => {
  let set = wordCache.get(name);
  if (!set) wordCache.set(name, (set = new Set(nameWords(name))));
  return set;
};

/**
 * How alike two exercises are: mostly how much of our name theirs covers (ExerciseDB's names are often longer:
 * "Machine Lying Leg Curl" for "Flat Leg Curl"), less for words that make it a variant, plus whether equipment agrees.
 */
export function matchScore(name: string, equipment: string[], candidate: GifCandidate): number {
  const ours = wordsOf(name);
  const theirs = wordsOf(candidate[1]);
  let shared = 0;
  for (const w of ours) if (theirs.has(w)) shared++;
  // Most of what we call it has to be there: "Rear Delt Fly" isn't a "rear drive".
  if (!ours.size || !theirs.size || shared / ours.size < 0.6) return -Infinity;
  let s = 0.6 * (shared / ours.size) + 0.4 * (shared / theirs.size);
  for (const w of theirs) if (DISTINCT.has(w) && !ours.has(w)) s -= 0.15;
  for (const w of ours) if (DISTINCT.has(w) && !theirs.has(w)) s -= 0.1;
  // Ties go to the plainer name ("barbell full squat" over "barbell full squat (back pov)").
  s -= theirs.size * 0.001;
  if (equipment.length) s += candidate[2].some((q) => equipment.includes(q.toLowerCase())) ? 0.15 : -0.2;
  return s;
}

/** Below this, a match is more likely the wrong exercise than a variant of the right one. */
export const MIN_MATCH = 0.62;

/** The best-matching ExerciseDB exercise for a name, if it's close enough. */
export function bestGifMatch(name: string, equipment: string[], candidates: GifCandidate[], min = MIN_MATCH) {
  let best: GifCandidate | undefined;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = matchScore(name, equipment, c);
    if (s > bestScore) [best, bestScore] = [c, s];
  }
  return { match: best && bestScore >= min ? best : undefined, best, score: bestScore };
}
