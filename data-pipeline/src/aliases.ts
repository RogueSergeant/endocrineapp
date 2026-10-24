/**
 * Turns the free-text substance names from the edlists.org spreadsheets
 * into the aliases a cosmetic label might actually print.
 *
 * The source names often pack several synonyms into one cell, e.g.
 * "Butyl 4-hydroxybenzoate; Butylparaben" or "Methyl 4-hydroxybenzoate
 * (Methylparaben)". Used verbatim, the normaliser turns those into index
 * keys no label will ever contain ("butyl 4 hydroxybenzoate; butylparaben",
 * and brackets are stripped entirely), so the common name never matched.
 */

/**
 * Split a cell into its separate names: on ";", on ": ", and on ", " when
 * the next part starts with a capital letter (", Bisphenol S"). Plain
 * commas are part of systematic names ("Phenol, 4-nonyl-, branched").
 */
export function splitNames(name: string): string[] {
  return name
    .split(/;\s*|:\s+|,\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !/^and\s/i.test(p));
}

// "BHT", "BP-3", "D5", "4-MBC": short, upper case, at least two letters.
export const ABBREVIATION_RE = /^(?=(?:[^A-Z]*[A-Z]){2}|[A-Z]\d)[A-Z0-9][A-Z0-9-]{1,7}$/;
/**
 * An abbreviation too cryptic to display as a substance's name: "BHT",
 * "TDCIPP", "3-BC", "BP-3". An all-caps word of up to 8 letters such as
 * "PARABENS" can't be told apart from one by its shape, so it counts too:
 * a mixed-case name is preferred, and it is still used when nothing else
 * is available.
 */
export function isBareAbbreviation(name: string): boolean {
  return ABBREVIATION_RE.test(name);
}

// "Methylparaben", "Cypermethrin": a capitalised common name.
const COMMON_NAME_RE = /^[A-Z][a-z]{3,}[a-z0-9 -]*$/;

/**
 * Bracketed annotations that are names in their own right, e.g.
 * "(Methylparaben)", "(BHT)", "(BP-3)", "(D5)". Only brackets preceded by
 * a space count: brackets glued to other characters are part of a
 * systematic name ("4-(heptan-2-yl)phenol"). Descriptions such as
 * "(polymer)", "(8-EO)", "(3:1)" or "(1R,4S)" are not names and are skipped.
 */
export function bracketedNames(name: string): string[] {
  const out: string[] = [];
  for (const m of name.matchAll(/\s\(([^()]{2,40})\)/g)) {
    const inner = m[1]!.trim();
    if (/^\d+-EO$/.test(inner)) continue;
    if (ABBREVIATION_RE.test(inner) || COMMON_NAME_RE.test(inner)) out.push(inner);
  }
  return out;
}

/**
 * True for a cell that packs several names together ("A; B", "A: B",
 * "A, Bisphenol S"). Uses the splitter's own rule so the two always agree.
 */
export function isCompoundName(name: string): boolean {
  return splitNames(name).length > 1;
}

/**
 * Every alias derivable from one source name. A compound cell is replaced
 * by its parts, since the joined string never appears on a label.
 */
export function expandName(name: string): string[] {
  const parts = splitNames(name);
  const out = parts.length > 1 ? [] : [name.trim()];
  for (const part of parts) {
    out.push(part);
    out.push(...bracketedNames(part));
  }
  return out;
}

/**
 * Label names (mostly cosmetic INCI names) for listed substances whose
 * edlists.org name is not what appears on a product, keyed by CAS. The
 * pipeline normally gets INCI names from a CosIng dump (data/cosing/),
 * which is not committed; these cover the ingredients that matter most
 * when it is absent.
 */
export const CURATED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "80-05-7": ["BPA"], // Bisphenol A
  "131-57-7": ["Benzophenone-3"], // Oxybenzone
  "36861-47-9": ["4-Methylbenzylidene Camphor", "Enzacamene"],
  "15087-24-8": ["3-Benzylidene Camphor"],
  "70356-09-1": ["Butyl Methoxydibenzoylmethane", "Avobenzone"],
  "80-54-6": ["Butylphenyl Methylpropional", "Lilial"], // source spells it "propianol"
  "541-02-6": ["Cyclopentasiloxane"], // D5
  "556-67-2": ["Cyclotetrasiloxane"], // D4
  "71617-10-2": ["Isoamyl p-Methoxycinnamate", "Amiloxate"],
  "55406-53-6": ["Iodopropynyl Butylcarbamate"], // IPBC
};

/** Case-insensitive de-duplication that keeps the first spelling seen. */
export function dedupeAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of aliases) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a.trim());
  }
  return out;
}
