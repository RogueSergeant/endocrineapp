// Header regex tolerates common OCR letter-confusions so a printed
// "INGREDIENTS" that OCR reads as "INGREDlENTS" or "1NGREDIENTS" still
// matches. The tolerant classes are used only on letters that are very
// likely to be misread by the recogniser on low-contrast labels.
const HEADER_RE =
  /\b([il1]ngred[il1]ents?|[il1]ngr[eé3]d[il1]ents?|ingred[il1]entes?|inhaltsstoffe|sammensetning|sast[oa]v[il1]ne|skladniki|composici[oó]n|compos[il1]tion)\b\s*[:\-—]?/i;

// Primary separators for ingredient lists. Newlines are treated as
// whitespace instead of separators when the list already uses commas,
// so OCR that wraps "Potassium Sorbate" across two lines doesn't get
// split into two separate ingredients.
const COMMA_SPLIT_RE = /[,;•·\u2022/]+/;
const NEWLINE_SPLIT_RE = /[,;•·\u2022\n\r/]+/;

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
  const headerMatch = text.match(HEADER_RE);
  if (headerMatch && headerMatch.index !== undefined) {
    text = text.slice(headerMatch.index + headerMatch[0].length);
  }
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
    .filter((p) => !/^(may contain|caps?|n°|nº)\s*$/i.test(p));
  return parts;
}
