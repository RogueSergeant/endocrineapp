/**
 * Light cleanup before feeding OCR text to the ingredient parser.
 * Fixes the most common OCR artefacts: ligatures, smart quotes, isolated dots,
 * stray line breaks in the middle of names.
 */
export function cleanOcrOutput(raw: string): string {
  if (!raw) return "";
  let out = raw;
  out = out.replace(/\u00AD/g, ""); // soft hyphen
  out = out.replace(/[\u2018\u2019]/g, "'");
  out = out.replace(/[\u201C\u201D]/g, '"');
  out = out.replace(/\u2013|\u2014/g, "-");
  out = out.replace(/[\t\r]+/g, " ");
  out = out.replace(/([a-z])\s*\n\s*([a-z])/g, "$1$2"); // join hyphenless wraps
  out = out.replace(/-\s*\n\s*/g, ""); // join hyphen-wrapped words
  out = out.replace(/\n{2,}/g, "\n");
  out = out.replace(/[ ]{2,}/g, " ");
  return out.trim();
}
