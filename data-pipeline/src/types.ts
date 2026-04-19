export interface RawAssessmentRow {
  name: string;
  casNumber: string | null;
  ecNumber: string | null;
  healthEffects: boolean | null;
  envEffects: boolean | null;
  status: string;
  year: number | null;
  regulatoryField: string | null;
  listId: 1 | 2 | 3;
}

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
  evidenceTier: 1 | 2 | 3;
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
