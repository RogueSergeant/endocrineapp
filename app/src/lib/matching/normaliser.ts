/**
 * Mirror of data-pipeline/src/normalise.ts. Keep them in sync — the index
 * is built with the pipeline's normaliser and looked up with this one.
 */
export function normalise(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Strip zero-width and bidi-control codepoints that survive NFKD and
  // sneak into OCR output via some fonts / clipboard pastes.
  s = s.replace(/[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[_-]+/g, " ");
  s = s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

export function looksLikeCas(s: string): boolean {
  return CAS_RE.test(s.trim());
}
