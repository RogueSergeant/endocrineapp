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

export type MatchType = "exact" | "fuzzy" | "cas";

export interface Match {
  substance: Substance;
  matchedAlias: string;
  matchedIngredient: string;
  ingredientPosition: number;
  matchType: MatchType;
  confidence: number;
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
}

export interface ScanDoc {
  id: string;
  createdAt: number;
  ocrText: string;
  parsedIngredients: string[];
  matches: StoredMatch[];
  imageStoragePath: string | null;
  appVersion: string;
  substancesDbVersion: string;
}
