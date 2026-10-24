// Keyword spotting on the recogniser's raw output. For every frame across a
// text line the model gives a probability for every character (plus the
// CTC "blank"); the text we display is only the single most likely reading.
// Here each substance name is scored against the whole distribution: the
// best placement of the name anywhere in the line, compared with the best
// unconstrained reading of the same frames. A name that was read cleanly
// scores 1; a letter the model thought likely but not most likely (the "l"
// behind a misread "t") costs a little; a letter it never considered costs
// a lot. Case is ignored, and a space in the name may be read as a space,
// a hyphen, other punctuation, or nothing at all.

/**
 * The recogniser's own reading of a line: the most likely class in each
 * frame, repeats collapsed and blanks dropped (CTC greedy decoding), with
 * the mean probability of the characters read as its confidence.
 */
export function decodeGreedy(
  probs: Float32Array,
  frames: number,
  classes: readonly string[],
): { text: string; confidence: number } {
  const n = classes.length;
  let text = "";
  let sum = 0;
  let count = 0;
  let prev = -1;
  for (let t = 0; t < frames; t++) {
    let best = 0;
    for (let c = 1; c < n; c++) if (probs[t * n + c]! > probs[t * n + best]!) best = c;
    if (best !== BLANK && best !== prev) {
      text += classes[best];
      sum += probs[t * n + best]!;
      count++;
    }
    prev = best;
  }
  return { text: text.trim(), confidence: count > 0 ? sum / count : 0 };
}

export interface SpotHit {
  /** The name (an index key) that was found. */
  key: string;
  /** 0-1: how fully the model's own probabilities support the name. */
  score: number;
}

interface Step {
  /** Class indices that count as this character (both cases). */
  classes: number[];
  /** A word gap rather than a letter, for the CTC no-skip rule. */
  gap: boolean;
}

interface Target {
  key: string;
  /** Spelled with its word gaps, and run together. */
  variants: Step[][];
  bigrams: string[];
}

export interface SpotterOptions {
  /** Ignore names shorter than this: too easily found by chance. */
  minLength?: number;
  /** Only score names sharing this fraction of letter pairs with the line. */
  minBigramOverlap?: number;
  /** Report hits at or above this score. */
  minScore?: number;
}

const DEFAULTS: Required<SpotterOptions> = {
  minLength: 5,
  minBigramOverlap: 0.35,
  minScore: 0.5,
};

const BLANK = 0;
// Probabilities are clamped so a letter the model ruled out entirely costs
// a large but finite amount.
const FLOOR = Math.log(1e-6);
// A character class counts as "considered" in a frame above this, for the
// cheap pre-filter.
const CONSIDERED = 0.02;

const bigramsOf = (s: string) => {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
};

/**
 * @param keys substance names as normalised index keys (lower case, words
 *   separated by single spaces)
 * @param classes the recogniser's output classes in order (index 0 blank)
 */
export function createSpotter(
  keys: Iterable<string>,
  classes: readonly string[],
  options: SpotterOptions = {},
) {
  const opts = { ...DEFAULTS, ...options };
  const byChar = new Map<string, number[]>();
  classes.forEach((c, i) => {
    if (i === BLANK || c.length !== 1) return;
    const k = c.toLowerCase();
    byChar.set(k, [...(byChar.get(k) ?? []), i]);
  });
  const gapClasses = [" ", "-", ",", ".", "/"].flatMap((c) => byChar.get(c) ?? []);
  const lowerOf = classes.map((c) => c.toLowerCase());

  const targets: Target[] = [];
  for (const key of keys) {
    const compact = key.replace(/ /g, "");
    if (compact.length < opts.minLength) continue;
    const letters = (word: string): Step[] | null => {
      const steps: Step[] = [];
      for (const ch of word) {
        const cls = byChar.get(ch);
        if (!cls) return null;
        steps.push({ classes: cls, gap: false });
      }
      return steps;
    };
    const joined = letters(compact);
    if (!joined) continue;
    const variants = [joined];
    if (key.includes(" ") && gapClasses.length > 0) {
      const spaced: Step[] = [];
      for (const [i, word] of key.split(" ").entries()) {
        if (i > 0) spaced.push({ classes: gapClasses, gap: true });
        spaced.push(...letters(word)!);
      }
      variants.push(spaced);
    }
    targets.push({ key, variants, bigrams: bigramsOf(compact) });
  }

  /** Best placement of `steps` anywhere in the line, as a mean log loss per step (<= 0). */
  function align(loss: Float32Array, frames: number, nClasses: number, steps: Step[]): number {
    const n = steps.length;
    const S = 2 * n + 1;
    let prev = new Float64Array(S).fill(-Infinity);
    let cur = new Float64Array(S);
    let best = -Infinity;
    for (let t = 0; t < frames; t++) {
      const row = t * nClasses;
      for (let s = 0; s < S; s++) {
        let emit: number;
        if (s % 2 === 0) {
          emit = loss[row + BLANK]!;
        } else {
          emit = -Infinity;
          for (const c of steps[(s - 1) / 2]!.classes) emit = Math.max(emit, loss[row + c]!);
        }
        let from = prev[s]!;
        if (s > 0) from = Math.max(from, prev[s - 1]!);
        if (s % 2 === 1 && s >= 3) {
          // Skipping the blank between two characters is allowed unless
          // they are the same character (CTC needs a blank to repeat one).
          const a = steps[(s - 1) / 2]!;
          const b = steps[(s - 3) / 2]!;
          if (a.classes[0] !== b.classes[0]) from = Math.max(from, prev[s - 2]!);
        }
        // The name may start at any frame: everything before it is free.
        if (s <= 1) from = Math.max(from, 0);
        cur[s] = from + emit;
      }
      best = Math.max(best, cur[S - 1]!, cur[S - 2]!);
      [prev, cur] = [cur, prev];
    }
    return best / n;
  }

  /**
   * Names found in one line. `probs` is the recogniser output for the line,
   * frames x classes, each row a probability distribution.
   */
  function spot(probs: Float32Array, frames: number): SpotHit[] {
    const nClasses = classes.length;
    // Log probability relative to the frame's most likely class: 0 for the
    // reading the model chose, negative for everything it liked less.
    const loss = new Float32Array(frames * nClasses);
    const considered = new Set<string>();
    let prevChars: string[] = [];
    for (let t = 0; t < frames; t++) {
      const row = t * nClasses;
      let max = 0;
      for (let c = 0; c < nClasses; c++) max = Math.max(max, probs[row + c]!);
      const logMax = Math.log(Math.max(max, 1e-12));
      const chars: string[] = [];
      for (let c = 0; c < nClasses; c++) {
        const p = probs[row + c]!;
        loss[row + c] = Math.max(Math.log(Math.max(p, 1e-12)), FLOOR) - logMax;
        if (c !== BLANK && p >= CONSIDERED) chars.push(lowerOf[c]!);
      }
      // Letter pairs the model considered at neighbouring frames (or
      // across a blank), for the pre-filter.
      if (chars.length > 0) {
        for (const a of prevChars) for (const b of chars) considered.add(a + b);
        prevChars = chars;
      }
    }

    const hits: SpotHit[] = [];
    for (const target of targets) {
      let shared = 0;
      for (const bg of target.bigrams) if (considered.has(bg)) shared++;
      if (shared < opts.minBigramOverlap * target.bigrams.length) continue;
      let best = -Infinity;
      for (const steps of target.variants)
        best = Math.max(best, align(loss, frames, nClasses, steps));
      const score = Math.exp(best);
      if (score >= opts.minScore) hits.push({ key: target.key, score });
    }
    return hits.sort((a, b) => b.score - a.score);
  }

  return { spot, size: targets.length };
}
