export type ListId = 1 | 2 | 3;

export interface RawAssessmentRow {
  name: string;
  casNumber: string | null;
  ecNumber: string | null;
  healthEffects: boolean | null;
  envEffects: boolean | null;
  status: string;
  year: number | null;
  regulatoryField: string | null;
  listId: ListId;
}

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

export interface PipelineConfig {
  rawDir: string;
  cacheDir: string;
  cosingDir: string;
  outDir: string;
  pubchemRateLimitPerSec: number;
  fuzzyEnrichmentEnabled: boolean;
  sourceLastUpdated: string;
}
