export const colors = {
  background: "#FAFAF9",
  surface: "#FFFFFF",
  text: "#0F172A",
  textMuted: "#64748B",
  border: "#E2E8F0",
  accent: "#0F766E",
  accentText: "#FFFFFF",
  // Evidence tier palette — conservative, never "red = bad" framing.
  tier1: { bg: "#FFE4E1", fg: "#9F1239", border: "#F87171" },
  tier2: { bg: "#FEF3C7", fg: "#92400E", border: "#F59E0B" },
  tier3: { bg: "#F1F5F9", fg: "#475569", border: "#CBD5E1" },
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const spacing = (n: number): number => n * 4;
