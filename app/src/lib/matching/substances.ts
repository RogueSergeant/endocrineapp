import substancesFile from "../../data/substances.json";
import substancesIndexFile from "../../data/substances-index.json";
import type { Substance, SubstancesFile, SubstancesIndex } from "../../types";

const file = substancesFile as SubstancesFile;
const indexFile = substancesIndexFile as SubstancesIndex;

export const SUBSTANCES: Record<string, Substance> = Object.fromEntries(
  file.substances.map((s) => [s.id, s]),
);
export const SUBSTANCES_LIST: Substance[] = file.substances;
export const SUBSTANCES_INDEX: Record<string, string> = indexFile.entries;
export const SUBSTANCES_DB_VERSION = file.version;
export const SUBSTANCES_SOURCE_UPDATED = file.sourceLastUpdated;
