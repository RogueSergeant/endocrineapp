// Dictionary repair of OCR output, before the ingredient parser sees it.
// The recogniser reads characters well but splits words at gaps it sees
// in condensed print ("W HOLEGRAIN", "Dim ethicone") and swaps the odd
// letter ("Propytparaben"). Both are fixed against a vocabulary of
// ingredient words. Deliberately conservative: a word is only changed
// when the result is in the vocabulary and the choice is unambiguous,
// because a wrong "fix" is worse than a typo the fuzzy matcher can still
// see through.

// Edits allowed for an unknown word of at least this many letters.
const ONE_EDIT_MIN = 5;
const TWO_EDITS_MIN = 8;

export interface WordRepair {
  (text: string): string;
  /** Whether the vocabulary has this word (any case). */
  has(word: string): boolean;
}

/** Levenshtein distance, giving up (returning cap + 1) beyond `cap`. */
function distanceWithin(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Copy the capitalisation pattern of `like` onto `word`. */
function matchCase(word: string, like: string): string {
  if (like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0]!.toUpperCase()) return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

export function createWordRepair(vocabulary: Iterable<string>): WordRepair {
  const known = new Set<string>();
  for (const w of vocabulary) if (/^[a-z]{2,}$/i.test(w)) known.add(w.toLowerCase());
  // Bucketed by length so a lookup only scans plausible candidates.
  const byLength = new Map<number, string[]>();
  for (const w of known) {
    const list = byLength.get(w.length) ?? [];
    list.push(w);
    byLength.set(w.length, list);
  }
  const has = (w: string) => known.has(w.toLowerCase());

  /** The one vocabulary word close enough to `word`, if exactly one is. */
  function nearest(word: string): string | null {
    const lower = word.toLowerCase();
    const cap = lower.length >= TWO_EDITS_MIN ? 2 : lower.length >= ONE_EDIT_MIN ? 1 : 0;
    if (cap === 0) return null;
    let best: string | null = null;
    let bestDistance = cap + 1;
    let tied = false;
    for (let len = lower.length - cap; len <= lower.length + cap; len++) {
      for (const cand of byLength.get(len) ?? []) {
        const d = distanceWithin(lower, cand, bestDistance);
        if (d < bestDistance) {
          best = cand;
          bestDistance = d;
          tied = false;
        } else if (d === bestDistance && cand !== best) {
          tied = true;
        }
      }
    }
    return best && !tied ? best : null;
  }

  function repairLine(line: string): string {
    // Words and the text between them, alternating: [word, sep, word, ...]
    // (the first and last entries may be separators).
    const parts = line.split(/([A-Za-z]+)/);
    const out: string[] = [];
    // parts[i] is a word for odd i; the separator after it is parts[i + 1].
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        out.push(parts[i]!);
        continue;
      }
      // Pass 1: join a word split by stray single spaces, when the joined
      // form is known and the pieces aren't all words in their own right.
      // Longest join first: "Dim eth icone" before "W HOLEGRAIN".
      let joined = false;
      for (const pieces of [3, 2]) {
        const words: string[] = [];
        for (let k = 0; k < pieces; k++) {
          const w = parts[i + 2 * k];
          if (w === undefined || (k > 0 && parts[i + 2 * k - 1] !== " ")) break;
          words.push(w);
        }
        if (words.length < pieces) continue;
        const whole = words.join("");
        if (has(whole) && !words.every(has)) {
          out.push(whole);
          i += 2 * (pieces - 1);
          joined = true;
          break;
        }
      }
      if (joined) continue;
      // Pass 2: correct an unknown word to its unambiguous nearest neighbour.
      const word = parts[i]!;
      const fix = has(word) ? null : nearest(word);
      out.push(fix ? matchCase(fix, word) : word);
    }
    return out.join("");
  }

  const repair = ((text: string) => text.split("\n").map(repairLine).join("\n")) as WordRepair;
  repair.has = has;
  return repair;
}
