import "fake-indexeddb/auto";
import { IDBFactory, IDBRequest as FakeRequest, forceCloseDatabase } from "fake-indexeddb";
import type { Match, Substance } from "@/types";

type History = typeof import("./history");

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

function input(createdAt: number) {
  return {
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

async function freshHistory(): Promise<History> {
  const factory = new IDBFactory();
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveScan / getScan", () => {
  it("stores a scan with denormalised matches and reads it back", async () => {
    const h = await freshHistory();
    const id = await h.saveScan(input(1000));
    expect(id).toEqual(expect.any(String));
    const doc = await h.getScan(id!);
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

  it("still saves when crypto.randomUUID is unavailable (insecure context)", async () => {
    const h = await freshHistory();
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const id = await h.saveScan(input(1000));
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await h.getScan(id!)).toBeDefined();
  });

  it("returns null instead of throwing when IndexedDB is unavailable", async () => {
    const h = await freshHistory();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked");
      },
    });
    expect(await h.saveScan(input(1000))).toBeNull();
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
    const a = await h.saveScan(input(1));
    await h.saveScan(input(2));
    await h.deleteScan(a!);
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
    const id = await h.saveScan(input(2));
    expect(id).not.toBeNull();
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

describe("hangs", () => {
  it("gives up on a save that never settles, so the scan can still finish", async () => {
    const h = await freshHistory();
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", hangingOpen());
    const saved = h.saveScan(input(1));
    await vi.advanceTimersByTimeAsync(h.DB_TIMEOUT_MS);
    expect(await saved).toBeNull();
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
    expect(await first).toBeNull();
    vi.useRealTimers();
    vi.stubGlobal("indexedDB", real);
    expect(await h.saveScan(input(2))).not.toBeNull();
  });
});
