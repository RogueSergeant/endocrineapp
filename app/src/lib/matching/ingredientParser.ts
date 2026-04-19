const HEADER_RE =
  /\b(ingredients?|ingr[ée]dients|ingredientes|inhaltsstoffe|sammensetning|sast[oa]vine|skladniki|composici[oó]n|composition)\b\s*[:\-—]?/i;

const SPLIT_RE = /[,;•·\u2022\n\r/]+/;

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
  const parts = protectedText
    .split(SPLIT_RE)
    .map((p) => restoreNumericGroups(p, tokens))
    .map((p) => p.replace(/[.\s]+$/g, "").trim())
    .map((p) => p.replace(/^[\s.\-•·\u2022]+/g, ""))
    .filter((p) => p.length > 0)
    // Drop common label scaffolding
    .filter((p) => !/^(may contain|caps?|n°|nº)\s*$/i.test(p));
  return parts;
}
