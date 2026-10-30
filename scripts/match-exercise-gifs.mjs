// Beta only: matches the exercise library (src/data/exerciseCatalog.json) to ExerciseDB's free V1 exercises, whose
// anatomical GIFs are shown instead of the library's photos while USE_ANATOMICAL is on (data/catalog.ts). Their
// licence for apps is unclear, so this is to be turned off (or licensed) before distributing.
//
// Usage: node scripts/match-exercise-gifs.mjs <exercisedb.json> [report.json]
//   exercisedb.json: an array of V1 /api/v1/exercises items. Writes src/data/exerciseGifs.json
//   ({ [catalogId]: exerciseDbId }), src/data/exerciseGifIndex.json (their exercises, for matching your own names in
//   the app) and, if given, every library exercise's best match and score to report.json.

import { readFileSync, writeFileSync } from 'node:fs';
// The same matching the app uses (Node runs the TypeScript directly).
import { bestGifMatch, equipmentFor } from '../src/core/gifMatch.ts';

const [, , input, reportPath] = process.argv;
if (!input) {
  console.error('Usage: node scripts/match-exercise-gifs.mjs <exercisedb.json>');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(new URL('../src/data/exerciseCatalog.json', import.meta.url), 'utf8'));
const edb = JSON.parse(readFileSync(input, 'utf8'));

// Hand-picked where names differ too much (our id → their exact name). Left out: exercises with no good counterpart
// (Face Pull, a plain Plank), which keep their photos.
const OVERRIDES = {
  Barbell_Squat: 'barbell full squat',
  Leg_Press: 'sled 45° leg press',
  'Wide-Grip_Lat_Pulldown': 'cable lat pulldown full range of motion',
  Barbell_Hip_Thrust: 'Barbell Glute Bridge Two-Leg On Bench',
  Triceps_Pushdown: 'cable pushdown',
  Side_Lateral_Raise: 'dumbbell lateral raise',
  Standing_Military_Press: 'barbell standing wide military press',
};

// One per name (ExerciseDB repeats a few), in the form the app matches against at run time.
const seen = new Set();
const candidates = edb
  .map((e) => [e.exerciseId, e.name.trim(), e.equipments.map((q) => q.toLowerCase())])
  .filter(([, name]) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));

const map = {};
const report = [];
for (const c of catalog) {
  if (OVERRIDES[c.id]) {
    const e = candidates.find(([, name]) => name.toLowerCase() === OVERRIDES[c.id].toLowerCase());
    if (!e) throw new Error(`Override for ${c.id} not found: ${OVERRIDES[c.id]}`);
    map[c.id] = e[0];
    report.push({ ours: c.name, theirs: e[1], score: 'override' });
    continue;
  }
  const { match, best, score } = bestGifMatch(c.name, equipmentFor(c.name, c.equipment, c.kind === 'bodyweight'), candidates);
  report.push({ ours: c.name, theirs: best?.[1], score: Math.round(score * 100) / 100 });
  if (match) map[c.id] = match[0];
}

writeFileSync(new URL('../src/data/exerciseGifs.json', import.meta.url), JSON.stringify(map) + '\n');
// For exercises you named yourself, matched in the app (data/catalog.ts gifIdFor).
writeFileSync(new URL('../src/data/exerciseGifIndex.json', import.meta.url), JSON.stringify(candidates) + '\n');
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`Matched ${Object.keys(map).length} of ${catalog.length}`);
