// Converts free-exercise-db (https://github.com/yuhonas/free-exercise-db, Unlicense / public domain)
// into the slim catalog bundled with the app.
//
// Usage:
//   curl -L https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json -o /tmp/exercises.json
//   node scripts/build-exercise-catalog.mjs /tmp/exercises.json

import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-exercise-catalog.mjs <path to exercises.json>');
  process.exit(1);
}

const GROUP_BY_MUSCLE = {
  chest: 'Chest',
  lats: 'Back',
  'middle back': 'Back',
  'lower back': 'Back',
  traps: 'Back',
  shoulders: 'Shoulders',
  neck: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  adductors: 'Legs',
  abductors: 'Legs',
  abdominals: 'Core',
};

const source = JSON.parse(readFileSync(input, 'utf8'));

const catalog = source
  .filter((e) => e.category !== 'stretching')
  .map((e) => ({
    id: e.id,
    name: e.name.trim(),
    muscleGroup: e.category === 'cardio' ? 'Cardio' : (GROUP_BY_MUSCLE[e.primaryMuscles?.[0]] ?? 'Other'),
    kind: e.equipment === 'body only' ? 'bodyweight' : 'weighted',
    ...(e.equipment && e.equipment !== 'body only' && e.equipment !== 'other' ? { equipment: e.equipment } : {}),
    // Photos are <id>/0.jpg and <id>/1.jpg in the dataset (data/catalog.ts exercisePhotos); a few have none.
    ...(e.images?.length ? {} : { noPhotos: true }),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(new URL('../src/data/exerciseCatalog.json', import.meta.url), JSON.stringify(catalog) + '\n');
console.log(`Wrote ${catalog.length} exercises`);
