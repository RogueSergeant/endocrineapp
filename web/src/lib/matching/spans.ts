import type { SubstancesIndex } from "@/types";
import { lookupAlias, type KnownWord } from "./matcher";

// Looking for substance names in the text itself rather than in the
// parsed ingredient list, so a name is found however the commas fell:
// glued to its neighbour ("Triphosphates: Sea Salt"), split by a stray
// space ("Butyl paraben"), or run into another word ("WaterPropylparaben").

export interface SpanFinding {
  substanceId: string;
  alias: string;
  /** The text the name was found in, as read. */
  text: string;
  /** 0 for an exact match, else the fuzzy edit distance. */
  distance: number;
  /**
   * The match spans an ingredient separator, so it may join the end of one
   * ingredient to the start of the next.
   */
  crossesSeparator: boolean;
}

// The longest substance names on labels run to about five words.
const MAX_WORDS = 5;
// A name found inside a longer word must be at least this long, or short
// names turn up by chance ("bha" in "abhati").
const MIN_EMBEDDED = 8;
const SEPARATOR_RE = /[,;•·•]|\.\s|[A-Za-z]{2}\.[A-Za-z]{2}/;

let embeddable: { index: SubstancesIndex; keys: string[] } | null = null;

function embeddableKeys(index: SubstancesIndex): string[] {
  if (embeddable?.index === index) return embeddable.keys;
  const keys = Object.keys(index).filter((k) => /^[a-z]+$/.test(k) && k.length >= MIN_EMBEDDED);
  embeddable = { index, keys };
  return keys;
}

export function findInSpans(
  text: string,
  index: SubstancesIndex,
  isKnownWord?: KnownWord,
): SpanFinding[] {
  // A hyphenated name is one word ("Benzophenone-4", "E-320"), so a window
  // can't drop its number and fuzzy-match a different family member.
  const tokens = [...text.matchAll(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g)].map((m) => ({
    word: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const found = new Map<string, SpanFinding>();
  const keep = (f: SpanFinding) => {
    const prev = found.get(f.substanceId);
    const better =
      !prev ||
      f.distance < prev.distance ||
      (f.distance === prev.distance && prev.crossesSeparator && !f.crossesSeparator);
    if (better) found.set(f.substanceId, f);
  };

  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= MAX_WORDS && i + n <= tokens.length; n++) {
      const run = tokens.slice(i, i + n);
      const slice = text.slice(run[0]!.start, run[n - 1]!.end);
      const crossesSeparator = SEPARATOR_RE.test(slice);
      const words = run.map((t) => t.word);
      // As spaced, and run together when every piece is letters (so
      // "Butyl paraben" is tried as "Butylparaben", but "E 3 21" is not).
      const forms = [words.join(" ")];
      if (n > 1 && words.every((w) => /^[A-Za-z]+$/.test(w))) forms.push(words.join(""));
      for (const form of forms) {
        const hit = lookupAlias(form, index, isKnownWord);
        if (hit) keep({ ...hit, text: slice, crossesSeparator });
      }
    }
  }

  // Names run into a longer word, which no window of whole words contains.
  for (const t of tokens) {
    const lower = t.word.toLowerCase();
    if (lower.length <= MIN_EMBEDDED) continue;
    for (const key of embeddableKeys(index)) {
      if (key.length < lower.length && lower.includes(key)) {
        keep({
          substanceId: index[key]!,
          alias: key,
          text: t.word,
          distance: 0,
          crossesSeparator: false,
        });
      }
    }
  }
  return [...found.values()];
}
