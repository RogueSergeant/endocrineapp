import { create } from "zustand";
import type { Match, Substance, SubstancesIndex } from "@/types";
import substancesData from "@/data/substances.json";
import substancesIndex from "@/data/substances-index.json";
import { buildLookup, type SubstanceLookup } from "@/lib/matching/matcher";

interface SubstancesData {
  version: string;
  source: string;
  sourceLastUpdated: string;
  substanceCount: number;
  substances: Substance[];
}

const data = substancesData as unknown as SubstancesData;
const lookup: SubstanceLookup = buildLookup(data.substances);
const index = substancesIndex as unknown as SubstancesIndex;

export interface CurrentScan {
  id: string | null;
  createdAt: number;
  productName: string | null;
  ocrText: string;
  parsedIngredients: string[];
  matches: Match[];
}

interface ScanState {
  current: CurrentScan | null;
  setCurrentScan: (scan: CurrentScan) => void;
  setCurrentProductName: (productName: string | null) => void;
  clearCurrentScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  current: null,
  setCurrentScan: (scan) => set({ current: scan }),
  setCurrentProductName: (productName) =>
    set((s) => (s.current ? { current: { ...s.current, productName } } : s)),
  clearCurrentScan: () => set({ current: null }),
}));

export const substanceDb = {
  version: data.version,
  sourceLastUpdated: data.sourceLastUpdated,
  substanceCount: data.substanceCount,
  substances: data.substances,
  lookup,
  index,
};

export function getSubstanceById(id: string): Substance | undefined {
  return lookup.byId[id];
}
