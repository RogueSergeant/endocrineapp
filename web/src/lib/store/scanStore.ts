import { create } from "zustand";
import type { Match, Substance, SubstancesIndex } from "@/types";
import substancesData from "@/data/substances.json";
import substancesIndex from "@/data/substances-index.json";
import { buildLookup, type SubstanceLookup } from "@/lib/matching/matcher";
import type { Spot } from "@/lib/ocr/protocol";

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
  ocrText: string;
  parsedIngredients: string[];
  matches: Match[];
}

/** One photo of a list that wraps round a pack, read and waiting for the next. */
export interface EarlierPhoto {
  rawText: string;
  spots: Spot[];
}

interface ScanState {
  current: CurrentScan | null;
  /** Photo picked on the scan page, waiting to be cropped. */
  pendingImage: Blob | null;
  /** Photos of the list so far, joined with the next one when it is read. */
  earlierPhotos: EarlierPhoto[];
  setCurrentScan: (scan: CurrentScan) => void;
  clearCurrentScan: () => void;
  setPendingImage: (image: Blob | null) => void;
  addEarlierPhoto: (photo: EarlierPhoto) => void;
  clearEarlierPhotos: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  current: null,
  pendingImage: null,
  setCurrentScan: (scan) => set({ current: scan }),
  clearCurrentScan: () => set({ current: null }),
  setPendingImage: (image) => set({ pendingImage: image }),
  earlierPhotos: [],
  addEarlierPhoto: (photo) => set((s) => ({ earlierPhotos: [...s.earlierPhotos, photo] })),
  clearEarlierPhotos: () => set({ earlierPhotos: [] }),
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
