// Turns a workout split pasted from a notes app into structured workouts. Deliberately
// forgiving: anything it can't read is still returned (with nulls) so the review screen
// can ask the user instead of silently dropping it.

export interface ParsedExercise {
  /** The original line, shown on the review screen for reference. */
  raw: string;
  name: string;
  sets: number | null;
  /** Reps as written: a single number ("8") or a range ("10-12"). */
  reps: { min: number; max: number } | null;
  /** Weight expression as written, e.g. "35", "70/140", "45+10+10". */
  weightText: string | null;
  /** Numbers found in the weight expression. */
  weights: number[];
  /** Text in parentheses or other trailing words. */
  note: string | null;
  /** The line ended in "or": the next exercise is probably an alternative to this one. */
  orNext: boolean;
}

export interface ParsedWorkout {
  name: string;
  exercises: ParsedExercise[];
}

const SETS_REPS = [
  // 2x8, 3 x 10-12, 4×6
  /^(?<name>.*?)[\s:–-]*\b(?<sets>\d{1,2})\s*[x×*]\s*(?<reps>\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\b(?<rest>.*)$/i,
  // 3 sets of 10, 3 sets x 8-12
  /^(?<name>.*?)[\s:–-]*\b(?<sets>\d{1,2})\s*sets?\s*(?:of|x|×)?\s*(?<reps>\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:reps?)?\b(?<rest>.*)$/i,
];

const WEIGHT = /^(?<expr>\d+(?:\.\d+)?(?:\s*[/+]\s*\d+(?:\.\d+)?)*)\s*(?:lbs?|kgs?|#)?\b/i;

function cleanLine(line: string) {
  return line
    .replace(/^\s*(?:[-•*·▪◦]|\d+[.)])\s+/, '') // bullets and "1." numbering
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSetsReps(line: string) {
  return SETS_REPS.some((re) => re.test(line));
}

function parseExercise(line: string): ParsedExercise {
  for (const re of SETS_REPS) {
    const m = line.match(re);
    if (!m?.groups || !m.groups.name.trim()) continue;
    const [lo, hi] = m.groups.reps.split(/[-–]/).map((n) => parseInt(n, 10));
    let rest = m.groups.rest.trim();

    let orNext = false;
    if (/\bor$/i.test(rest)) {
      orNext = true;
      rest = rest.replace(/\bor$/i, '').trim();
    }

    const notes: string[] = [];
    rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
      if (inner.trim()) notes.push(inner.trim());
      return ' ';
    });
    rest = rest.replace(/^[@,\s]+/, '').trim();

    let weightText: string | null = null;
    const w = rest.match(WEIGHT);
    if (w?.groups) {
      weightText = w.groups.expr.replace(/\s+/g, '');
      rest = rest.slice(w[0].length).trim();
    }
    if (rest) notes.unshift(rest);

    return {
      raw: line,
      name: m.groups.name.replace(/[\s:–-]+$/, '').trim(),
      sets: parseInt(m.groups.sets, 10),
      reps: { min: lo, max: hi ?? lo },
      weightText,
      weights: weightText ? weightText.split(/[/+]/).map(Number) : [],
      note: notes.join('; ') || null,
      orNext,
    };
  }

  // No sets×reps: keep the line as an exercise name so the user can fill in the rest.
  let name = line;
  let orNext = false;
  if (/\bor$/i.test(name)) {
    orNext = true;
    name = name.replace(/\bor$/i, '').trim();
  }
  const noteMatch = name.match(/\(([^)]*)\)/);
  return {
    raw: line,
    name: name.replace(/\([^)]*\)/g, '').trim(),
    sets: null,
    reps: null,
    weightText: null,
    weights: [],
    note: noteMatch?.[1].trim() || null,
    orNext,
  };
}

/**
 * Splits text into workouts. A line starts a new workout when it has no sets×reps and is
 * either followed by exercise lines after a blank line / start of text, or ends with ":".
 * Exercises that appear before any heading go into a workout called "Imported workout".
 */
export function parseWorkoutText(text: string): ParsedWorkout[] {
  const lines = text.split(/\r?\n/).map(cleanLine);
  const workouts: ParsedWorkout[] = [];
  let current: ParsedWorkout | null = null;

  const nextContentLine = (from: number) => {
    for (let j = from; j < lines.length; j++) if (lines[j]) return lines[j];
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const afterBreak = i === 0 || !lines[i - 1];
    const next = nextContentLine(i + 1);
    const looksLikeHeading =
      !hasSetsReps(line) &&
      (/:$/.test(line) || (afterBreak && next != null && hasSetsReps(next) && line.split(' ').length <= 6));

    if (looksLikeHeading) {
      current = { name: line.replace(/:$/, '').trim(), exercises: [] };
      workouts.push(current);
      continue;
    }
    if (!current) {
      current = { name: 'Imported workout', exercises: [] };
      workouts.push(current);
    }
    current.exercises.push(parseExercise(line));
  }

  return workouts.filter((w) => w.exercises.length > 0);
}
