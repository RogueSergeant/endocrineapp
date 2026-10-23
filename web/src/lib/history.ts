// Scan history, stored only in this browser (IndexedDB). Nothing is sent
// anywhere. Every call tolerates IndexedDB being unavailable (private
// windows, blocked site data): saving silently does nothing and reading
// returns an empty list, so scanning still works.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Match, ScanDoc, StoredMatch } from "@/types";

interface HistoryDb extends DBSchema {
  scans: {
    key: string;
    value: ScanDoc;
    indexes: { createdAt: number };
  };
}

let dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null;

function db(): Promise<IDBPDatabase<HistoryDb>> {
  dbPromise ??= openDB<HistoryDb>("ed-scanner", 1, {
    upgrade(database) {
      const store = database.createObjectStore("scans", { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    },
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export function denormaliseMatch(match: Match): StoredMatch {
  return {
    substanceId: match.substance.id,
    canonicalName: match.substance.canonicalName,
    evidenceTier: match.substance.evidenceTier,
    matchedAlias: match.matchedAlias,
    matchedIngredient: match.matchedIngredient,
    ingredientPosition: match.ingredientPosition,
    matchType: match.matchType,
    confidence: match.confidence,
  };
}

export interface CreateScanInput {
  createdAt: number;
  ocrText: string;
  parsedIngredients: string[];
  matches: Match[];
  substancesDbVersion: string;
}

/** Returns the saved scan's id, or null if it couldn't be stored. */
export async function saveScan(input: CreateScanInput): Promise<string | null> {
  const doc: ScanDoc = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt,
    ocrText: input.ocrText,
    parsedIngredients: input.parsedIngredients,
    matches: input.matches.map(denormaliseMatch),
    appVersion: __APP_VERSION__,
    substancesDbVersion: input.substancesDbVersion,
  };
  try {
    await (await db()).put("scans", doc);
    return doc.id;
  } catch (err) {
    console.warn("saveScan failed, continuing without history:", err);
    return null;
  }
}

export async function listScans(limit = 50): Promise<ScanDoc[]> {
  try {
    const all = await (await db()).getAllFromIndex("scans", "createdAt");
    return all.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

export async function getScan(id: string): Promise<ScanDoc | undefined> {
  try {
    return await (await db()).get("scans", id);
  } catch {
    return undefined;
  }
}

export async function deleteScan(id: string): Promise<void> {
  await (await db()).delete("scans", id);
}

export async function deleteAllScans(): Promise<void> {
  await (await db()).clear("scans");
}
