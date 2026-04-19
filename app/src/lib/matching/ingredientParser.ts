const HEADER_RE =
  /(?:^|\n|\.|\s)(ingredients?|ingr[eé]dients?|ingredientes|inhaltsstoffe|zutaten|composition)\s*[:.\-–]/i;

/**
 * Splits ingredient strings on commas/semicolons/newlines/bullets, but is careful
 * not to break numeric tokens like "1,3-butanediol" or "C12-15".
 */
function splitIngredients(body: string): string[] {
  // Replace commas that sit between digits (e.g. "1,3-butanediol") with a
  // placeholder so naive splitting doesn't fracture them.
  const DIGIT_COMMA = /(\d),(?=\d)/g;
  const protectedBody = body.replace(DIGIT_COMMA, "$1\u0001");
  const parts = protectedBody
    .split(/[,;\n•·]+/g)
    .map((p) => p.replace(/\u0001/g, ","))
    .map((p) => p.trim())
    .map((p) => p.replace(/^[\s•\-–·.]+|[\s.·]+$/g, "").trim())
    .filter((p) => p.length > 0);
  return parts;
}

export function parseIngredients(ocrText: string): string[] {
  if (!ocrText) return [];
  const match = ocrText.match(HEADER_RE);
  let body = ocrText;
  if (match && match.index != null) {
    body = ocrText.slice(match.index + match[0].length);
  }
  return splitIngredients(body);
}
