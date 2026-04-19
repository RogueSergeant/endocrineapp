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

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

export function looksLikeCas(s: string): boolean {
  return CAS_RE.test(s.trim());
}
