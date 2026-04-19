/**
 * Light-touch cleanup applied to ML Kit's raw text before the parser sees it.
 * Don't overdo this — the parser handles most edge cases. The goal here is to
 * fix common OCR-ism noise: stray hyphenation at line breaks, multiple
 * spaces, smart quotes.
 */
export function cleanOcrOutput(text: string): string {
  if (!text) return "";
  let s = text;
  // Joins words split across lines: "buty-\nlparaben" → "butylparaben"
  s = s.replace(/-\n\s*/g, "");
  // Normalise smart quotes / dashes that confuse downstream regexes
  s = s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
  // Collapse runs of whitespace except newlines (which the parser uses).
  s = s.replace(/[ \t\f\v]+/g, " ");
  return s.trim();
}
