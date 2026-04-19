// Header regex tolerates common OCR letter-confusions so a printed
// "INGREDIENTS" that OCR reads as "INGREDlENTS" or "1NGREDIENTS" still
// matches. The tolerant classes are used only on letters that are very
// likely to be misread by the recogniser on low-contrast labels.
const HEADER_RE =
  /\b([il1]ngred[il1]ents?|[il1]ngr[eé3]d[il1]ents?|ingred[il1]entes?|inhaltsstoffe|sammensetning|sast[oa]v[il1]ne|skladniki|composici[oó]n|compos[il1]tion)\b\s*[:\-—]?/i;

// Fallback when OCR mangles the header beyond the regex. Real labels
// almost always render the word with a colon immediately after, so we
// scan for any all-caps-or-titlecase token followed by ":" near the
// top of the text and accept the first one whose lowercased form is
// within edit-distance 4 of "ingredients" (allows up to four dropped
// characters, which covers cases like "NGEDENTS:").
const FALLBACK_HEADER_RE = /\b([A-Z][A-Za-zé3l1]{4,14})\s*[:;]/g;
const HEADER_WORD = "ingredients";

// End-of-list markers. After we slice from the header, any text after
// one of these is warning copy / marketing / contact info and should
// not be treated as ingredients.
const END_OF_LIST_RE = new RegExp(
  [
    "caution",
    "warning",
    "directions",
    "direction",
    "usage",
    "storage",
    "danger",
    "do\\s+not\\s+(?:pierce|burn|spray|apply|use|expose|ingest)",
    "keep\\s+out\\s+of\\s+reach",
    "for\\s+external\\s+use",
    "avoid\\s+(?:contact|spraying|prolonged)",
    "protect\\s+from",
    "may\\s+(?:burst|cause|irritate)",
    "extremely\\s+flammable",
    "tolerance\\s+tested",
    "dermatologically\\s+tested",
    "discontinue\\s+use",
    "if\\s+(?:irritation|swallowed|ingested)",
    "made\\s+in\\s+(?:eu|the|spain|italy|france|germany|uk|china|usa)",
    "manufactured\\s+by",
    "distributed\\s+by",
    "best\\s+before",
    "net\\s+wt",
    "net\\s+weight",
    "exp(?:iry|ires?)",
  ].join("|"),
  "i",
);

// Primary separators for ingredient lists. Newlines are treated as
// whitespace instead of separators when the list already uses commas,
// so OCR that wraps "Potassium Sorbate" across two lines doesn't get
// split into two separate ingredients.
const COMMA_SPLIT_RE = /[,;•·\u2022/]+/;
const NEWLINE_SPLIT_RE = /[,;•·\u2022\n\r/]+/;

function levenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

function findHeader(text: string): { index: number; length: number } | null {
  const exact = text.match(HEADER_RE);
  if (exact && exact.index !== undefined) {
    return { index: exact.index, length: exact[0].length };
  }
  // Only scan the first ~1000 chars — headers always appear near the
  // top of label text and we don't want to false-match a warning word.
  const window = text.slice(0, 1000);
  for (const m of window.matchAll(FALLBACK_HEADER_RE)) {
    const word = (m[1] ?? "").toLowerCase().replace(/[l1]/g, "i").replace(/3/g, "e");
    if (levenshtein(word, HEADER_WORD, 4) <= 4) {
      return { index: m.index ?? 0, length: m[0].length };
    }
  }
  return null;
}

function sliceToEndMarker(text: string): string {
  const m = text.match(END_OF_LIST_RE);
  if (m && m.index !== undefined) {
    return text.slice(0, m.index);
  }
  return text;
}

/**
 * Treat runs of `digit,digit` and `digit-digit` as atomic so that
 * INCI names with commas inside them (e.g. `1,3-butanediol`) survive
 * naive comma splitting.
 */
function protectNumericGroups(text: string): { protectedText: string; tokens: string[] } {
  const tokens: string[] = [];
  const protectedText = text.replace(/(\d[\d,.-]*\d)/g, (m) => {
    if (!m.includes(",")) return m;
    const idx = tokens.push(m) - 1;
    return `__NUM${idx}__`;
  });
  return { protectedText, tokens };
}

function restoreNumericGroups(s: string, tokens: string[]): string {
  return s.replace(/__NUM(\d+)__/g, (_match, idx: string) => tokens[Number(idx)] ?? "");
}

export function parseIngredients(rawOcrText: string): string[] {
  if (!rawOcrText) return [];
  let text = rawOcrText;
  const header = findHeader(text);
  if (header) {
    text = text.slice(header.index + header.length);
  }
  // Keep only the run of text up to the first warning / marketing /
  // address marker. Without this, "INGREDIENTS: Aqua, Glycerin.
  // CAUTION: avoid eyes." becomes ingredients = ["Aqua", "Glycerin",
  // "CAUTION: avoid eyes"], which both pollutes the parsed list and
  // produces noisy fuzzy matches downstream.
  text = sliceToEndMarker(text);

  const { protectedText, tokens } = protectNumericGroups(text);
  // If the body already uses commas as separators, newlines are almost
  // certainly mid-ingredient line-wraps from the OCR and should be
  // folded into whitespace. Without this, "Potassium\nSorbate" splits
  // into two tokens and "Potassium" then matches the wrong substance.
  const commaCount = (protectedText.match(/,/g) ?? []).length;
  const normalisedText =
    commaCount >= 2
      ? protectedText.replace(/[\r\n]+/g, " ")
      : protectedText;
  const splitRe = commaCount >= 2 ? COMMA_SPLIT_RE : NEWLINE_SPLIT_RE;
  const parts = normalisedText
    .split(splitRe)
    .map((p) => restoreNumericGroups(p, tokens))
    .map((p) => p.replace(/[.\s]+$/g, "").trim())
    .map((p) => p.replace(/^[\s.\-•·\u2022]+/g, ""))
    .filter((p) => p.length > 0)
    // Drop common label scaffolding
    .filter((p) => !/^(may contain|caps?|n°|nº)\s*$/i.test(p))
    // Drop tokens that look like sentences rather than ingredient names —
    // anything with 6+ words is almost certainly a warning fragment that
    // slipped past the end-marker slice.
    .filter((p) => p.split(/\s+/).length < 6);
  return parts;
}
