import { create } from "zustand";
import type { Match, ScanDoc } from "../../types";

interface ScanState {
  lastOcrText: string;
  lastParsed: string[];
  lastMatches: Match[];
  lastScanId: string | null;
  setLast: (payload: {
    ocrText: string;
    parsed: string[];
    matches: Match[];
    scanId: string | null;
  }) => void;
  clear: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  lastOcrText: "",
  lastParsed: [],
  lastMatches: [],
  lastScanId: null,
  setLast: ({ ocrText, parsed, matches, scanId }) =>
    set({
      lastOcrText: ocrText,
      lastParsed: parsed,
      lastMatches: matches,
      lastScanId: scanId,
    }),
  clear: () =>
    set({ lastOcrText: "", lastParsed: [], lastMatches: [], lastScanId: null }),
}));

interface HistoryState {
  history: ScanDoc[];
  hydrated: boolean;
  setHistory: (scans: ScanDoc[]) => void;
  prepend: (scan: ScanDoc) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  history: [],
  hydrated: false,
  setHistory: (scans) => set({ history: scans, hydrated: true }),
  prepend: (scan) => set((s) => ({ history: [scan, ...s.history] })),
  remove: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
  clear: () => set({ history: [] }),
}));
