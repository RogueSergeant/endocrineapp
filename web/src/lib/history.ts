// Scan history, stored only in this browser (IndexedDB). Nothing is sent
// anywhere. Every call tolerates IndexedDB being unavailable (private
// windows, blocked site data), hanging (a WebKit bug can leave open() or a
// request pending forever) or being closed by the browser (iOS Safari drops
// the connection of a backgrounded PWA): saving silently does nothing and
// reading returns an empty list, so scanning still works. A failed call
// drops the cached connection so the next one reopens it.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Match, ScanDoc, StoredMatch } from "@/types";
import { withTimeout } from "@/lib/timeout";

interface HistoryDb extends DBSchema {
  scans: {
    key: string;
    value: ScanDoc;
    indexes: { createdAt: number };
  };
}

export const DB_TIMEOUT_MS = 8000;

let dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null;

function resetDb() {
  dbPromise = null;
}

function db(): Promise<IDBPDatabase<HistoryDb>> {
  dbPromise ??= openDB<HistoryDb>("ed-scanner", 1, {
    upgrade(database) {
      const store = database.createObjectStore("scans", { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    },
    // Another tab wants a newer schema: step aside so it isn't blocked.
    blocking(_current, _next, event) {
      (event.target as IDBDatabase).close();
      resetDb();
    },
    terminated: resetDb,
  });
  const opened = dbPromise;
  opened.catch(() => {
    if (dbPromise === opened) resetDb();
  });
  return opened;
}

/** Runs one history operation, bounded in time; any failure drops the connection. */
async function run<T>(op: (database: IDBPDatabase<HistoryDb>) => Promise<T>): Promise<T> {
  try {
    return await withTimeout(
      db().then(op),
      DB_TIMEOUT_MS,
      "Scan history didn't respond. Try reloading the page.",
    );
  } catch (err) {
    resetDb();
    throw err;
  }
}

/** A random id; crypto.randomUUID only exists in secure contexts on newer browsers. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
  try {
    const doc: ScanDoc = {
      id: newId(),
      createdAt: input.createdAt,
      ocrText: input.ocrText,
      parsedIngredients: input.parsedIngredients,
      matches: input.matches.map(denormaliseMatch),
      appVersion: __APP_VERSION__,
      substancesDbVersion: input.substancesDbVersion,
    };
    await run((d) => d.put("scans", doc));
    return doc.id;
  } catch (err) {
    console.warn("saveScan failed, continuing without history:", err);
    return null;
  }
}

/** The newest `limit` scans, newest first. */
export async function listScans(limit = 50): Promise<ScanDoc[]> {
  try {
    return await run(async (d) => {
      const out: ScanDoc[] = [];
      let cursor = await d.transaction("scans").store.index("createdAt").openCursor(null, "prev");
      while (cursor && out.length < limit) {
        out.push(cursor.value);
        cursor = await cursor.continue();
      }
      return out;
    });
  } catch {
    return [];
  }
}

export async function getScan(id: string): Promise<ScanDoc | undefined> {
  try {
    return await run((d) => d.get("scans", id));
  } catch {
    return undefined;
  }
}

export async function deleteScan(id: string): Promise<void> {
  await run((d) => d.delete("scans", id));
}

export async function deleteAllScans(): Promise<void> {
  await run((d) => d.clear("scans"));
}
