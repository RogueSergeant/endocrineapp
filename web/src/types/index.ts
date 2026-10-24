export type ListId = 1 | 2 | 3;

export interface Assessment {
  listId: ListId;
  status: string;
  regulatoryField: string | null;
  year: number | null;
}

export interface Substance {
  id: string;
  casNumber: string | null;
  ecNumber: string | null;
  canonicalName: string;
  evidenceTier: ListId;
  healthEffects: boolean;
  envEffects: boolean;
  assessments: Assessment[];
  aliases: string[];
  inciName: string | null;
}

export interface SubstancesFile {
  version: string;
  source: "edlists.org";
  sourceLastUpdated: string;
  substanceCount: number;
  substances: Substance[];
}

export type SubstancesIndex = Record<string, string>;

/**
 * "possible": found only by reading the list more loosely (across commas,
 * with an uncertain reading, or by the keyword spotter), so the user
 * should check it against the label.
 */
export type MatchType = "exact" | "fuzzy" | "cas" | "possible";

export interface Match {
  substance: Substance;
  matchedAlias: string;
  matchedIngredient: string;
  ingredientPosition: number;
  matchType: MatchType;
  confidence: number;
  /** For a possible match: the text it was found in, as we read it. */
  readAs?: string;
  /** For a possible match from a photo: that line of the photo (not stored). */
  snippet?: Blob;
}

export interface StoredMatch {
  substanceId: string;
  canonicalName: string;
  evidenceTier: ListId;
  matchedAlias: string;
  matchedIngredient: string;
  ingredientPosition: number;
  matchType: MatchType;
  confidence: number;
  readAs?: string;
}

export interface ScanDoc {
  id: string;
  createdAt: number;
  ocrText: string;
  parsedIngredients: string[];
  matches: StoredMatch[];
  appVersion: string;
  substancesDbVersion: string;
}
