import { boundedDistance } from "./matcher";
import { normalise } from "./normaliser";

/**
 * Curated list of ingredient names commonly seen on cosmetic / personal
 * care labels. Used to canonicalise OCR output — turning "Caprylyl
 * Giycol" back into "Caprylyl Glycol" for display, and fixing up labels
 * that the flag-matcher would otherwise miss because of single-char
 * misreads. Keep entries in canonical (title / INCI-style) case.
 */
const CANONICAL_INCI: string[] = [
  "Aqua",
  "Water",
  "Glycerin",
  "Glycerol",
  "Parfum",
  "Fragrance",
  "Alcohol",
  "Alcohol Denat",
  "Aluminum Chlorohydrate",
  "Aluminium Chlorohydrate",
  "Aluminum Chloride",
  "Aluminum Starch Octenylsuccinate",
  "Aluminum Hydroxide",
  "Aluminum Stearate",
  "Aluminum Zirconium Tetrachlorohydrex Glycine",
  "Stearyl Ether",
  "Stearyl Alcohol",
  "Steareth-2",
  "Steareth-10",
  "Steareth-20",
  "Steareth-21",
  "Ceteareth-20",
  "Cetearyl Alcohol",
  "Cetearyl Glucoside",
  "Cetyl Alcohol",
  "Cetyl Palmitate",
  "Caprylyl Glycol",
  "Caprylic Triglyceride",
  "Caprylic/Capric Triglyceride",
  "Calcium Silicate",
  "Calcium Carbonate",
  "Calcium Chloride",
  "Calcium Lactate",
  "Calcium Pantothenate",
  "Sodium Chloride",
  "Sodium Benzoate",
  "Sodium Hydroxide",
  "Sodium Lauryl Sulfate",
  "Sodium Laureth Sulfate",
  "Sodium Citrate",
  "Sodium Stearate",
  "Sodium Cocoyl Isethionate",
  "Sodium Hyaluronate",
  "Sodium PCA",
  "Potassium Sorbate",
  "Potassium Chloride",
  "Potassium Hydroxide",
  "Citric Acid",
  "Ascorbic Acid",
  "Salicylic Acid",
  "Hyaluronic Acid",
  "Lactic Acid",
  "Glycolic Acid",
  "Stearic Acid",
  "Palmitic Acid",
  "Oleic Acid",
  "Linoleic Acid",
  "Lactose",
  "Whey Protein",
  "Xanthan Gum",
  "Phenoxyethanol",
  "Ethylhexylglycerin",
  "Tocopherol",
  "Tocopheryl Acetate",
  "Retinol",
  "Retinyl Palmitate",
  "Niacinamide",
  "Panthenol",
  "Dexpanthenol",
  "Allantoin",
  "Dimethicone",
  "Cyclomethicone",
  "Cyclopentasiloxane",
  "Cyclohexasiloxane",
  "Propylene Glycol",
  "Butylene Glycol",
  "Pentylene Glycol",
  "Hexylene Glycol",
  "Polyethylene Glycol",
  "Glyceryl Stearate",
  "PEG-40 Hydrogenated Castor Oil",
  "PEG-100 Stearate",
  "PEG-8",
  "PEG-20",
  "PPG-15 Stearyl Ether",
  "PPG-20 Methyl Glucose Ether",
  "Isopropyl Palmitate",
  "Isopropyl Myristate",
  "Isopropyl Alcohol",
  "Linalool",
  "Limonene",
  "Geraniol",
  "Citronellol",
  "Eugenol",
  "Coumarin",
  "Benzyl Alcohol",
  "Benzyl Benzoate",
  "Benzyl Salicylate",
  "Hexyl Cinnamal",
  "Alpha-Isomethyl Ionone",
  "Titanium Dioxide",
  "Zinc Oxide",
  "Iron Oxides",
  "Mica",
  "Silica",
  "Talc",
  "Kaolin",
  "Paraffinum Liquidum",
  "Mineral Oil",
  "Petrolatum",
  "Lanolin",
  "Shea Butter",
  "Cocoa Butter",
  "Jojoba Oil",
  "Argan Oil",
  "Coconut Oil",
  "Olive Oil",
  "Sunflower Seed Oil",
  "Hydroxyethylcellulose",
  "Hydroxypropyl Methylcellulose",
  "Carbomer",
  "Acrylates Copolymer",
  "Disodium EDTA",
  "Tetrasodium EDTA",
  "Trisodium EDTA",
  "Butylparaben",
  "Methylparaben",
  "Ethylparaben",
  "Propylparaben",
  "Isobutane",
  "Propane",
  "Butane",
  "Polysorbate 20",
  "Polysorbate 60",
  "Polysorbate 80",
  "Sorbitan Oleate",
  "Sorbitan Stearate",
  "Hydrogenated Castor Oil",
  "Hydrogenated Vegetable Oil",
  "Bisabolol",
  "Bisphenol A",
];

export interface IngredientDictionary {
  phrases: Map<string, string>;
  words: Map<string, string>;
}

function buildDictionary(entries: readonly string[]): IngredientDictionary {
  const phrases = new Map<string, string>();
  const words = new Map<string, string>();
  for (const entry of entries) {
    const n = normalise(entry);
    if (!n) continue;
    if (!phrases.has(n)) phrases.set(n, entry);
    for (const word of entry.split(/\s+/)) {
      const wn = normalise(word);
      if (!wn || wn.length < 4) continue;
      if (!words.has(wn)) words.set(wn, word);
    }
  }
  return { phrases, words };
}

export const DEFAULT_DICTIONARY: IngredientDictionary = buildDictionary(CANONICAL_INCI);

function phraseCap(len: number): number {
  if (len < 5) return 0;
  return Math.min(3, Math.max(1, Math.round(len / 8)));
}

function wordCap(len: number): number {
  if (len < 5) return 0;
  if (len <= 9) return 1;
  if (len <= 13) return 2;
  return 3;
}

function bestFuzzy(
  needle: string,
  dict: Map<string, string>,
  cap: number,
): string | null {
  if (cap <= 0) return null;
  let best: { canonical: string; distance: number } | null = null;
  for (const [key, canonical] of dict) {
    if (Math.abs(key.length - needle.length) > cap) continue;
    const d = boundedDistance(needle, key, cap);
    if (d <= cap && (!best || d < best.distance)) {
      best = { canonical, distance: d };
      if (d === 0) break;
    }
  }
  return best ? best.canonical : null;
}

function isRepeatedLetterNoise(word: string): boolean {
  // "ww", "xxx", "lll" etc. — 2-3 chars, same letter, no vowel.
  return word.length <= 3 && /^([a-zA-Z])\1+$/.test(word);
}

function correctWord(word: string, dict: IngredientDictionary): string {
  const n = normalise(word);
  if (!n) return word;
  const exact = dict.words.get(n);
  if (exact) return exact;
  const hit = bestFuzzy(n, dict.words, wordCap(n.length));
  return hit ?? word;
}

export function correctIngredient(
  token: string,
  dict: IngredientDictionary = DEFAULT_DICTIONARY,
): string {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  const n = normalise(trimmed);
  if (n) {
    const exact = dict.phrases.get(n);
    if (exact) return exact;
    const hit = bestFuzzy(n, dict.phrases, phraseCap(n.length));
    if (hit) return hit;
  }
  // Word-by-word fallback. Also drops obvious repeated-letter garbage
  // ("Calcium ww Silicate" → "Calcium Silicate") introduced by the OCR
  // between real words.
  const words = trimmed.split(/\s+/);
  const out: string[] = [];
  for (const w of words) {
    const corrected = correctWord(w, dict);
    if (words.length > 1 && isRepeatedLetterNoise(corrected)) continue;
    out.push(corrected);
  }
  return out.join(" ").trim();
}

export function correctIngredients(
  tokens: string[],
  dict: IngredientDictionary = DEFAULT_DICTIONARY,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const corrected = correctIngredient(t, dict);
    if (!corrected) continue;
    const key = normalise(corrected);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(corrected);
  }
  return out;
}
