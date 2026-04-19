export type EvidenceTier = 1 | 2 | 3;
export type MatchType = "exact" | "fuzzy" | "cas";

export interface Assessment {
  listId: 1 | 2 | 3;
  status: string;
  regulatoryField: string | null;
  year: number | null;
}

export interface Substance {
  id: string;
  casNumber: string | null;
  ecNumber: string | null;
  canonicalName: string;
  evidenceTier: EvidenceTier;
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

export interface SubstancesIndex {
  version: string;
  entries: Record<string, string>;
}

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
  evidenceTier: EvidenceTier;
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
