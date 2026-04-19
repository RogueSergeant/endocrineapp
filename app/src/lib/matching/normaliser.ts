const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

export function normalise(s: string): string {
  if (!s) return "";
  let out = s.toLowerCase();
  out = out.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  out = out.replace(/\([^)]*\)/g, " ");
  out = out.replace(/[-_]/g, " ");
  out = out.replace(/[^a-z0-9 ]+/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export function looksLikeCas(s: string): boolean {
  return CAS_RE.test(s.trim());
}

export function extractCas(s: string): string | null {
  const trimmed = s.trim();
  if (CAS_RE.test(trimmed)) return trimmed;
  const m = trimmed.match(/\b\d{2,7}-\d{2}-\d\b/);
  return m ? m[0] : null;
}
