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
 * How readable a name is as a display name, best first: 0 for a name with
 * lower-case letters ("Butylparaben", "3-Benzylidene Camphor"), 1 for a
 * longer all-caps name, 2 for a short all-caps token ("BHT", "TDCIPP",
 * "PFOSA", "3-BC"). Shape can't tell "ATRAZINE" from "BADGE", so all short
 * all-caps tokens rank last; they are still used when nothing else exists.
 */
export function readabilityRank(name: string): 0 | 1 | 2 {
  if (/[a-z]/.test(name)) return 0;
  return ABBREVIATION_RE.test(name) ? 2 : 1;
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
  // Food additive E-numbers, which food labels print instead of the name.
  // Both spellings: the normaliser keeps "E321" whole and reads "E-321"
  // and "E 321" as "e 321".
  "128-37-0": ["E321", "E 321"], // BHT
  "99-76-3": ["E218", "E 218"], // Methylparaben
  "94-13-3": ["E216", "E 216"], // Propylparaben
};

/**
 * Label names for substances the source lists without a CAS number, so
 * they get no PubChem synonyms; keyed by the exact source name.
 */
export const CURATED_ALIASES_BY_NAME: Readonly<Record<string, readonly string[]>> = {
  // The common name and E-number labels print; the source has only the
  // systematic name and the abbreviation.
  "2-tert-butyl-4-methoxyphenol (BHA)": [
    "Butylated Hydroxyanisole",
    "Butylhydroxyanisole",
    "E320",
    "E 320",
  ],
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

// Locants ("4-", "1,3,4-") or brackets: the marks of a systematic name.
const LOCANT_RE = /\d[,-]|[[\](){}]/;
// A display name worth replacing: brackets, three or more locant digits,
// or sheer length. Short systematic names ("4-tert-butylphenol") read fine.
const isComplex = (name: string) =>
  /[[\](){}]/.test(name) || (name.match(/\d/g)?.length ?? 0) >= 3 || name.length > 40;
// A plain name: up to four words of letters, optionally with a leading
// locant or a trailing number or capital ("4-Methylbenzylidene Camphor",
// "Butylated Hydroxyanisole", "Benzophenone-1", "Bisphenol A").
const PLAIN_NAME_RE =
  /^(?:\d{1,2}-)?[A-Za-z][a-z]{2,}(?:[ -](?:[A-Za-z][a-z]{2,}|[A-Z])){0,3}(?:-\d{1,2})?$/;
const TRAILING_ABBREV_RE = /\s\(([A-Z0-9][A-Z0-9-]{1,})\)\s*$/;
// A plain name must share at least this long a run of letters with the
// systematic one to count as describing the same chemical.
const MIN_SHARED = 5;
const MIN_SHARE = 0.5;

const lettersOf = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * How much of `name` is `systematic`'s chemistry: the share of its letters
 * that sit in runs of 4+ letters also found in the systematic name, and the
 * longest such run.
 */
function chemistryShared(name: string, systematic: string): { share: number; longest: number } {
  const x = lettersOf(name);
  const y = lettersOf(systematic);
  let covered = 0;
  let longest = 0;
  for (let i = 0; i < x.length; ) {
    let len = 0;
    while (i + len < x.length && y.includes(x.slice(i, i + len + 1))) len++;
    if (len >= 4) {
      covered += len;
      longest = Math.max(longest, len);
      i += len;
    } else {
      i++;
    }
  }
  return { share: x.length > 0 ? covered / x.length : 0, longest };
}

/**
 * The name to show for a substance. A complex systematic display name
 * ("1,3,4,6,7,8-hexahydro-4,6,6,7,8,8-hexamethylindeno[5,6-c]pyran
 * (HHCB)") gives way to a plain one, keeping the abbreviation:
 *
 * - the first plain name in `own`, the names from the source lists and
 *   the curated label names ("Tetrabromobisphenol A", "Butylated
 *   Hydroxyanisole (BHA)"), which regulators and labels actually use;
 * - failing that, the first plain name in `others` (PubChem's synonyms,
 *   preferred names first) that is mostly the systematic name's chemistry
 *   ("Tetrabromobisphenol A", "Hexamethylindanopyran (HHCB)"). Sharing
 *   chemistry is what tells a descriptive name from a trade name
 *   ("Bromdian"); with none close enough, the systematic name stays.
 */
export function preferCommonName(
  canonical: string,
  own: readonly string[],
  others: readonly string[] = [],
): string {
  const abbrev = canonical.match(TRAILING_ABBREV_RE)?.[1] ?? null;
  const core = abbrev ? canonical.slice(0, canonical.lastIndexOf("(")).trim() : canonical;
  if (!LOCANT_RE.test(core)) return canonical;
  const plain = (a: string) => PLAIN_NAME_RE.test(a.trim()) && !isComplex(a.trim());
  // The source lists' and curated label names replace any systematic name;
  // PubChem's, less trustworthy, only a complex one.
  let chosen = own.find(plain)?.trim() ?? null;
  if (!chosen && !isComplex(core)) return canonical;
  // PubChem lists its preferred names first: the first plain one that is
  // mostly the systematic name's chemistry, so trade names don't qualify.
  chosen ??=
    others.find((a) => {
      if (!plain(a)) return false;
      const { share, longest } = chemistryShared(a, core);
      return longest >= MIN_SHARED && share >= MIN_SHARE;
    })?.trim() ?? null;
  if (!chosen) return canonical;
  const name = chosen.replace(/^(\d{1,2}-)?([a-z])/, (_, loc: string | undefined, c: string) => (loc ?? "") + c.toUpperCase());
  return abbrev ? `${name} (${abbrev})` : name;
}
