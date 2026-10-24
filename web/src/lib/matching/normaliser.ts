/**
 * Mirror of data-pipeline/src/normalise.ts. Keep them in sync — the index
 * is built with the pipeline's normaliser and looked up with this one.
 */
export function normalise(input: string): string {
  if (!input) return "";
  // Brackets first, while case still tells marks from name parts.
  // A bracketed note after a space ("OATS (10%)", "Glycerin (vegetable)")
  // is dropped. A bracket glued to a word is part of a chemical name when
  // it holds lower case or digits ("Tris(2-ethylhexyl) phosphate"): only
  // the brackets go, or the name collapses to something generic ("tris
  // phosphate"). One holding only capitals is a mark ("Triton(TM)
  // X-114", "IGEPAL(R)") and is dropped.
  let s = input
    .replace(/(^|\s)\([^)]*\)/g, " ")
    .replace(/\(([^)]*)\)/g, (_, inner: string) => (/[a-z0-9]/.test(inner) ? ` ${inner} ` : " "))
    .toLowerCase();
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // Strip zero-width and bidi-control codepoints that survive NFKD and
  // sneak into OCR output via some fonts / clipboard pastes.
  s = s.replace(/[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, "");
  s = s.replace(/[_-]+/g, " ");
  s = s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

export function looksLikeCas(s: string): boolean {
  return CAS_RE.test(s.trim());
}
