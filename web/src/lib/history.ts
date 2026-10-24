// Scan history, stored only in this browser (IndexedDB). Nothing is sent
// anywhere. Every call tolerates IndexedDB being unavailable (private
// windows, blocked site data), hanging (a WebKit bug can leave open() or a
// request pending forever) or being closed by the browser (iOS Safari drops
// the connection of a backgrounded PWA): saving silently does nothing and
// reading returns an empty list, so scanning still works. A connection that
// fails or hangs is forgotten so the next call opens a fresh one.
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

/**
 * IndexedDB can't be used here at all: there is no API, open() throws
 * straight away, storage is blocked (SecurityError), or a private window
 * refuses it (InvalidStateError, Firefox before 115). Nothing can have
 * been stored, so deleting counts as done. Any other open failure (e.g.
 * Safari's "connection lost") may sit on top of real data and is reported.
 */
class HistoryUnavailableError extends Error {
  override name = "HistoryUnavailableError";
}

const UNAVAILABLE_ON_OPEN = new Set(["SecurityError", "InvalidStateError"]);

let dbPromise: Connection | null = null;

/**
 * Stop handing out a connection. It is only closed where that is needed
 * (another tab's upgrade) or harmless (already terminated): closing a
 * merely suspect connection would break sibling operations still using it.
 */
function forget(connection: Connection, { close = false } = {}) {
  if (dbPromise === connection) dbPromise = null;
  if (close) {
    connection.then(
      (d) => d.close(),
      () => {},
    );
  }
}

function db(): Connection {
  if (dbPromise) return dbPromise;
  let connection: Connection;
  try {
    connection = openDB<HistoryDb>("ed-scanner", 1, {
      upgrade(database) {
        const store = database.createObjectStore("scans", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      },
      // Another tab wants a newer schema: step aside so it isn't blocked.
      blocking: () => forget(connection, { close: true }),
      terminated: () => forget(connection, { close: true }),
    }).catch((err: unknown) => {
      throw err instanceof DOMException && UNAVAILABLE_ON_OPEN.has(err.name)
        ? new HistoryUnavailableError(err.message)
        : err;
    });
  } catch (err) {
    // No IndexedDB at all, or a private mode that throws from open() itself.
    connection = Promise.reject(new HistoryUnavailableError(String(err)));
  }
  dbPromise = connection;
  connection.catch(() => forget(connection));
  return connection;
}

/** Errors after which the connection shouldn't be reused, as opposed to e.g. a full disk. */
const SUSPECT_CONNECTION = new Set([
  "InvalidStateError",
  "UnknownError",
  "TransactionInactiveError",
  // Transactions on a connection iOS Safari cut off fail this way, often
  // without a close event.
  "AbortError",
]);

function connectionSuspect(err: unknown): boolean {
  return (
    err instanceof TimeoutError || (err instanceof DOMException && SUSPECT_CONNECTION.has(err.name))
  );
}

/** Runs one history operation, bounded in time; a failing or hung connection is forgotten. */
async function run<T>(op: (database: IDBPDatabase<HistoryDb>) => Promise<T>): Promise<T> {
  const connection = db();
  try {
    return await withTimeout(
      connection.then(op),
      DB_TIMEOUT_MS,
      "Scan history didn't respond. Try reloading the page.",
    );
  } catch (err) {
    if (connectionSuspect(err)) forget(connection);
    throw err;
  }
}

/** A random id; crypto.randomUUID only exists in secure contexts on newer browsers. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Scans abandoned mid-save. A hung save can commit after the delete meant
// to undo it, so their ids are remembered in localStorage (when available,
// shared with other tabs), filtered out of every read, and purged in the
// background on each read. A pending save can't outlive its page, so ids
// left by earlier sessions are forgotten once a purge has removed them.
const DISCARDED_KEY = "ed-scanner:discarded";
const MAX_DISCARDED = 50;

function loadDiscarded(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(DISCARDED_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Ids from earlier sessions: safe to forget once purged. */
const earlierDiscards = loadDiscarded();
const discarded = new Set(earlierDiscards);

/** Pick up ids discarded in other tabs. */
function syncDiscarded() {
  for (const id of loadDiscarded()) discarded.add(id);
}

function saveDiscarded(forgotten: ReadonlySet<string> = new Set()) {
  try {
    const ids = [...new Set([...loadDiscarded(), ...discarded])].filter((id) => !forgotten.has(id));
    localStorage.setItem(DISCARDED_KEY, JSON.stringify(ids.slice(-MAX_DISCARDED)));
  } catch {
    // Still filtered for this session.
  }
}

/** Delete every discarded id in one transaction, in the background: reads only filter. */
function purgeDiscarded() {
  if (discarded.size === 0) return;
  const ids = [...discarded];
  run(async (d) => {
    const tx = d.transaction("scans", "readwrite");
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  }).then(
    () => {
      const forgotten = new Set(ids.filter((id) => earlierDiscards.has(id)));
      if (forgotten.size === 0) return;
      for (const id of forgotten) {
        earlierDiscards.delete(id);
        discarded.delete(id);
      }
      saveDiscarded(forgotten);
    },
    () => {},
  );
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
  syncDiscarded();
  purgeDiscarded();
  try {
    return await run(async (d) => {
      const out: ScanDoc[] = [];
      let cursor = await d.transaction("scans").store.index("createdAt").openCursor(null, "prev");
      while (cursor && out.length < limit) {
        if (!discarded.has(cursor.value.id)) out.push(cursor.value);
        cursor = await cursor.continue();
      }
      return out;
    });
  } catch {
    return [];
  }
}

export async function getScan(id: string): Promise<ScanDoc | undefined> {
  syncDiscarded();
  if (discarded.has(id)) return undefined;
  purgeDiscarded();
  try {
    return await run((d) => d.get("scans", id));
  } catch {
    return undefined;
  }
}

/** Deleting from history that can't exist succeeds; any other failure is reported. */
async function deleting(op: (database: IDBPDatabase<HistoryDb>) => Promise<void>): Promise<void> {
  try {
    await run(op);
  } catch (err) {
    if (!(err instanceof HistoryUnavailableError)) throw err;
  }
}

export async function deleteScan(id: string): Promise<void> {
  await deleting((d) => d.delete("scans", id));
}

export async function deleteAllScans(): Promise<void> {
  await deleting((d) => d.clear("scans"));
}

/** Remove a scan the user abandoned while it was saving. Never throws. */
export async function discardScan(id: string): Promise<void> {
  discarded.add(id);
  saveDiscarded();
  try {
    await deleteScan(id);
  } catch {
    // Still hidden; purged again on later reads.
  }
}
