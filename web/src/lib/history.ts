// Scan history, stored only in this browser (IndexedDB). Nothing is sent
// anywhere. Every call tolerates IndexedDB being unavailable (private
// windows, blocked site data), hanging (a WebKit bug can leave open() or a
// request pending forever) or being closed by the browser (iOS Safari drops
// the connection of a backgrounded PWA): saving silently does nothing and
// reading returns an empty list, so scanning still works. A broken or hung
// connection is closed and dropped so the next call reopens it.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Match, ScanDoc, StoredMatch } from "@/types";
import { TimeoutError, withTimeout } from "@/lib/timeout";

interface HistoryDb extends DBSchema {
  scans: {
    key: string;
    value: ScanDoc;
    indexes: { createdAt: number };
  };
}

export const DB_TIMEOUT_MS = 8000;

type Connection = Promise<IDBPDatabase<HistoryDb>>;

let dbPromise: Connection | null = null;

/**
 * Forget a connection and close it. Only clears the cache if it still
 * holds that connection, so a late event from an old one can't drop a
 * newer, healthy one.
 */
function drop(connection: Connection) {
  if (dbPromise === connection) dbPromise = null;
  connection.then(
    (d) => d.close(),
    () => {},
  );
}

function db(): Connection {
  if (dbPromise) return dbPromise;
  const connection: Connection = openDB<HistoryDb>("ed-scanner", 1, {
    upgrade(database) {
      const store = database.createObjectStore("scans", { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    },
    // Another tab wants a newer schema: step aside so it isn't blocked.
    blocking: () => drop(connection),
    terminated: () => drop(connection),
  });
  dbPromise = connection;
  connection.catch(() => drop(connection));
  return connection;
}

/** Errors that mean the connection itself is dead, as opposed to e.g. a full disk. */
const BROKEN_CONNECTION = new Set(["InvalidStateError", "UnknownError", "TransactionInactiveError"]);

function connectionBroken(err: unknown): boolean {
  return err instanceof TimeoutError || (err instanceof DOMException && BROKEN_CONNECTION.has(err.name));
}

/** Runs one history operation, bounded in time; a dead or hung connection is dropped. */
async function run<T>(op: (database: IDBPDatabase<HistoryDb>) => Promise<T>): Promise<T> {
  const connection = db();
  try {
    return await withTimeout(
      connection.then(op),
      DB_TIMEOUT_MS,
      "Scan history didn't respond. Try reloading the page.",
    );
  } catch (err) {
    if (connectionBroken(err)) drop(connection);
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
  /** From newId(), chosen by the caller so it is known even if saving fails. */
  id: string;
  createdAt: number;
  ocrText: string;
  parsedIngredients: string[];
  matches: Match[];
  substancesDbVersion: string;
}

/**
 * Returns whether the scan was stored. A save that timed out can still
 * commit later; it then appears in History under `input.id`.
 */
export async function saveScan(input: CreateScanInput): Promise<boolean> {
  try {
    const doc: ScanDoc = {
      id: input.id,
      createdAt: input.createdAt,
      ocrText: input.ocrText,
      parsedIngredients: input.parsedIngredients,
      matches: input.matches.map(denormaliseMatch),
      appVersion: __APP_VERSION__,
      substancesDbVersion: input.substancesDbVersion,
    };
    await run((d) => d.put("scans", doc));
    return true;
  } catch (err) {
    console.warn("saveScan failed, continuing without history:", err);
    return false;
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
