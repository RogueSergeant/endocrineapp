import "fake-indexeddb/auto";
import {
  IDBFactory,
  IDBRequest as FakeRequest,
  // Exported subclass of fake-indexeddb's internal event, usable for any event type.
  IDBVersionChangeEvent as FakeEvent,
  forceCloseDatabase,
} from "fake-indexeddb";
import type { Match, Substance } from "@/types";

import type * as HistoryModule from "./history";

type History = typeof HistoryModule;

const substance: Substance = {
  id: "s-1",
  casNumber: "94-26-8",
  ecNumber: null,
  canonicalName: "Butylparaben",
  evidenceTier: 1,
  healthEffects: true,
  envEffects: false,
  assessments: [],
  aliases: ["Butylparaben"],
  inciName: "Butylparaben",
};

const match: Match = {
  substance,
  matchedAlias: "butylparaben",
  matchedIngredient: "Butylparaben",
  ingredientPosition: 2,
  matchType: "exact",
  confidence: 1,
};

let counter = 0;

function input(createdAt: number, id = `scan-${++counter}`) {
  return {
    id,
    createdAt,
    ocrText: "Aqua, Glycerin, Butylparaben",
    parsedIngredients: ["Aqua", "Glycerin", "Butylparaben"],
    matches: [match],
    substancesDbVersion: "test",
  };
}

/** An open() request that never fires success or error. */
const hangingOpen = () => ({ open: () => new (FakeRequest as unknown as new () => IDBRequest)() });

/** Every opened connection, so tests can force-close them like Safari does. */
let opened: IDBRequest<IDBDatabase>[] = [];

/** A Map-backed localStorage, since Node has none by default. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

async function freshHistory(factory = new IDBFactory()): Promise<History> {
  opened = [];
  const open = factory.open.bind(factory);
  factory.open = (name: string, version?: number) => {
    const req = open(name, version);
    opened.push(req);
    return req;
  };
  vi.stubGlobal("indexedDB", factory);
  vi.resetModules();
  return import("./history");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveScan / getScan", () => {
  it("stores a scan with denormalised matches and reads it back", async () => {
    const h = await freshHistory();
    const id = h.newId();
    expect(await h.saveScan(input(1000, id))).toBe(true);
    const doc = await h.getScan(id);
    expect(doc).toMatchObject({
      id,
      createdAt: 1000,
      parsedIngredients: ["Aqua", "Glycerin", "Butylparaben"],
      matches: [{ substanceId: "s-1", canonicalName: "Butylparaben", evidenceTier: 1 }],
    });
  });

  it("returns undefined for an unknown id", async () => {
    const h = await freshHistory();
    expect(await h.getScan("missing")).toBeUndefined();
  });

  it("still makes ids when crypto.randomUUID is unavailable (insecure context)", async () => {
    const h = await freshHistory();
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const id = h.newId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(h.newId()).not.toBe(id);
    expect(await h.saveScan(input(1000, id))).toBe(true);
    expect(await h.getScan(id)).toBeDefined();
  });

  it("returns false instead of throwing when IndexedDB is unavailable", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked");
      },
    });
    expect(await h.saveScan(input(1000))).toBe(false);
    expect(await h.listScans()).toEqual([]);
  });
});

describe("listScans", () => {
  it("returns the newest scans first, up to the limit", async () => {
    const h = await freshHistory();
    for (const t of [3000, 1000, 5000, 2000, 4000]) await h.saveScan(input(t));
    const scans = await h.listScans(3);
    expect(scans.map((s) => s.createdAt)).toEqual([5000, 4000, 3000]);
  });

  it("returns everything when there are fewer scans than the limit", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    await h.saveScan(input(2));
    expect((await h.listScans()).map((s) => s.createdAt)).toEqual([2, 1]);
  });
});

describe("deleteScan / deleteAllScans", () => {
  it("removes one scan, then all of them", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1, "a"));
    await h.saveScan(input(2, "b"));
    await h.deleteScan("a");
    expect((await h.listScans()).map((s) => s.createdAt)).toEqual([2]);
    await h.deleteAllScans();
    expect(await h.listScans()).toEqual([]);
  });
});

describe("connection recovery", () => {
  it("reopens after the browser force-closes the connection", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    expect(opened).toHaveLength(1);
    forceCloseDatabase(opened[0]!.result as never);
    expect(await h.saveScan(input(2))).toBe(true);
    expect(opened).toHaveLength(2);
    expect((await h.listScans()).map((s) => s.createdAt)).toEqual([2, 1]);
  });

  it("reopens after a failed call even without a close event", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    // A plain close() fires no event: the next call fails, then recovers.
    opened[0]!.result.close();
    expect(await h.listScans()).toEqual([]);
    expect((await h.listScans()).map((s) => s.createdAt)).toEqual([1]);
  });
});

describe("connection handling", () => {
  it("closes the old connection when the browser asks it to step aside", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    const first = opened[0]!.result;
    let closed = false;
    first.addEventListener("close", () => (closed = true));
    const origClose = first.close.bind(first);
    first.close = () => {
      closed = true;
      origClose();
    };
    // Another tab opening a newer version fires versionchange on ours.
    const upgrade = indexedDB.open("ed-scanner", 2);
    await new Promise((resolve, reject) => {
      upgrade.onsuccess = resolve;
      upgrade.onerror = reject;
    });
    expect(closed).toBe(true);
    upgrade.result.close();
  });

  it("does not drop the connection for an error that isn't about the connection", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    expect(await h.saveScan(input(2))).toBe(false);
    expect(await h.saveScan(input(3))).toBe(true);
    expect(opened).toHaveLength(1);
  });

  it("a late event from a dropped connection leaves the new one alone", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    const old = opened[0]!.result;
    // Break the first connection so the next call opens a second one.
    old.close();
    await h.listScans();
    expect((await h.listScans()).length).toBe(1);
    expect(opened).toHaveLength(2);
    // The first connection now reports termination, late.
    forceCloseDatabase(old as never);
    expect(await h.saveScan(input(2))).toBe(true);
    expect(opened).toHaveLength(2);
  });
});

describe("history unavailable", () => {
  it("deleting succeeds when IndexedDB can't be opened: nothing is stored", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked in private mode");
      },
    });
    await expect(h.deleteScan("x")).resolves.toBeUndefined();
    await expect(h.deleteAllScans()).resolves.toBeUndefined();
  });

  it("reports a delete when open() fails on a database that may hold scans", async () => {
    const factory = new IDBFactory();
    // Another tab has already upgraded the schema: our v1 open now fails
    // with VersionError, but the scans are still on disk.
    const newer = factory.open("ed-scanner", 2);
    await new Promise((resolve) => (newer.onsuccess = resolve));
    newer.result.close();
    const h = await freshHistory(factory);
    await expect(h.deleteAllScans()).rejects.toMatchObject({ name: "VersionError" });
  });

  it("treats an old Firefox private window (async InvalidStateError) as nothing stored", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", {
      open: () => {
        // A real fake request that fails the way Firefox's did, asynchronously.
        const req = new (FakeRequest as unknown as new () => IDBRequest)() as IDBRequest & {
          _error: DOMException;
          readyState: string;
        };
        setTimeout(() => {
          req._error = new DOMException("A mutation operation was attempted", "InvalidStateError");
          req.readyState = "done";
          req.dispatchEvent(new FakeEvent("error") as unknown as Event);
        });
        return req;
      },
    });
    await expect(h.deleteAllScans()).resolves.toBeUndefined();
  });

  it("treats blocked storage (SecurityError) as nothing stored", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    await expect(h.deleteAllScans()).resolves.toBeUndefined();
  });

  it("a delete on a broken connection still fails loudly", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementationOnce(() => {
      throw new DOMException("Broken", "UnknownError");
    });
    await expect(h.deleteAllScans()).rejects.toThrow();
  });

  it("drops the connection on an AbortError from a cut-off connection", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Connection lost", "AbortError");
    });
    expect(await h.saveScan(input(2))).toBe(false);
    expect(await h.saveScan(input(3))).toBe(true);
    expect(opened).toHaveLength(2);
  });
});

describe("discardScan", () => {
  it("removes a scan the user abandoned", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1, "keep"));
    await h.saveScan(input(2, "abandoned"));
    await h.discardScan("abandoned");
    expect((await h.listScans()).map((s) => s.id)).toEqual(["keep"]);
  });

  it("keeps it hidden and deletes it if the save commits late", async () => {
    const h = await freshHistory();
    await h.discardScan("late");
    // The hung save finally commits after the delete went through.
    await h.saveScan(input(5, "late"));
    expect(await h.getScan("late")).toBeUndefined();
    expect(await h.listScans()).toEqual([]);
    // The read purged it, so the entry is really gone.
    await vi.waitFor(async () => expect(await getRaw("late")).toBeUndefined());
  });

  it("stays hidden after a reload and is purged when the late save lands", async () => {
    const factory = new IDBFactory();
    const before = await freshHistory(factory);
    await before.discardScan("late");
    await before.saveScan(input(5, "late")); // commits after the undo
    // Reload: a new module instance on the same database and storage.
    vi.resetModules();
    vi.stubGlobal("indexedDB", factory);
    const after = (await import("./history")) as History;
    expect(await after.getScan("late")).toBeUndefined();
    expect(await after.listScans()).toEqual([]);
    await vi.waitFor(async () => expect(await getRaw("late")).toBeUndefined());
    // An earlier session's id is forgotten once purged: its save can't still be pending.
    await vi.waitFor(() => expect(localStorage.getItem("ed-scanner:discarded")).toBe("[]"));
  });

  it("keeps this session's ids after a purge, in case a hung save lands later", async () => {
    const h = await freshHistory();
    await h.discardScan("mine");
    await h.listScans();
    await vi.waitFor(async () => expect(await getRaw("mine")).toBeUndefined());
    expect(JSON.parse(localStorage.getItem("ed-scanner:discarded")!)).toEqual(["mine"]);
    await h.saveScan(input(9, "mine")); // the hung save finally commits
    expect(await h.listScans()).toEqual([]);
  });

  it("hides scans another tab discarded", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1, "theirs"));
    expect(await h.listScans()).toHaveLength(1);
    localStorage.setItem("ed-scanner:discarded", JSON.stringify(["theirs"]));
    expect(await h.listScans()).toEqual([]);
    expect(await h.getScan("theirs")).toBeUndefined();
  });

  it("doesn't make reads wait for a purge", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1, "keep"));
    await h.discardScan("stuck");
    // Deletes hang (a save stuck on the connection would do this).
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(
      () => new (FakeRequest as unknown as new () => IDBRequest)() as never,
    );
    vi.useFakeTimers();
    const list = h.listScans();
    await vi.advanceTimersByTimeAsync(10);
    expect((await list).map((s) => s.id)).toEqual(["keep"]);
  });

  it("is purged before a single-scan read too", async () => {
    const h = await freshHistory();
    await h.saveScan(input(1, "keep"));
    await h.discardScan("gone");
    await h.saveScan(input(2, "gone"));
    expect(await h.getScan("keep")).toBeDefined();
    await vi.waitFor(async () => expect(await getRaw("gone")).toBeUndefined());
  });

  it("still works when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    const h = await freshHistory();
    await h.saveScan(input(1, "x"));
    await h.discardScan("x");
    expect(await h.listScans()).toEqual([]);
  });

  it("never throws, even when history is broken", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", hangingOpen());
    vi.useFakeTimers();
    const discarding = h.discardScan("x");
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    await expect(discarding).resolves.toBeUndefined();
  });
});

/** Read straight from the database, bypassing history.ts's hiding. */
async function getRaw(id: string): Promise<unknown> {
  const req = indexedDB.open("ed-scanner", 1);
  const d = await new Promise<IDBDatabase>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const get = d.transaction("scans").objectStore("scans").get(id);
  const value = await new Promise((resolve, reject) => {
    get.onsuccess = () => resolve(get.result);
    get.onerror = () => reject(get.error);
  });
  d.close();
  return value;
}

describe("hangs", () => {
  it("gives up on a save that never settles, so the scan can still finish", async () => {
    const h = await freshHistory();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", hangingOpen());
    const saved = h.saveScan(input(1));
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    expect(await saved).toBe(false);
  });

  it("returns an empty list and undefined from reads that hang", async () => {
    const h = await freshHistory();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", hangingOpen());
    const list = h.listScans();
    const one = h.getScan("x");
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    expect(await list).toEqual([]);
    expect(await one).toBeUndefined();
  });

  it("rejects a delete that hangs with a readable error", async () => {
    const h = await freshHistory();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", hangingOpen());
    const del = h.deleteAllScans();
    const assertion = expect(del).rejects.toThrow(/didn't respond/);
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    await assertion;
  });

  it("retries a fresh open after a hang instead of reusing the stuck one", async () => {
    const h = await freshHistory();
    const real = indexedDB;
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", hangingOpen());
    const first = h.saveScan(input(1));
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    expect(await first).toBe(false);
    vi.useRealTimers();
    vi.stubGlobal("indexedDB", real);
    expect(await h.saveScan(input(2))).toBe(true);
  });
});
