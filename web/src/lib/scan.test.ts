import "fake-indexeddb/auto";
import type { ScanDoc } from "@/types";
import { deleteAllScans, getScan, listScans } from "@/lib/history";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { useScanStore } from "@/lib/store/scanStore";
import {
  completeScan,
  forgetAllScans,
  forgetScan,
  matchesFromDoc,
  scanImage,
  TooFewIngredientsError,
} from "./scan";

vi.mock("@/lib/ocr/textRecognition", () => ({ recogniseText: vi.fn() }));

const LABEL = "Aqua, Glycerin, Butylparaben, Phenoxyethanol";
const crop = {} as ImageBitmap;

beforeEach(async () => {
  await deleteAllScans();
  useScanStore.getState().clearCurrentScan();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("completeScan", () => {
  it("parses, matches, saves and makes it the current scan", async () => {
    const id = await completeScan(LABEL, LABEL);
    expect(id).not.toBeNull();
    const current = useScanStore.getState().current!;
    expect(current.id).toBe(id);
    expect(current.parsedIngredients).toHaveLength(4);
    expect(current.matches.map((m) => m.substance.casNumber)).toEqual(["94-26-8"]);
    expect((await getScan(id!))?.parsedIngredients).toEqual(current.parsedIngredients);
  });

  it("rejects a photo read with fewer than 3 ingredients", async () => {
    await expect(completeScan("Butylparaben", "Butylparaben")).rejects.toBeInstanceOf(
      TooFewIngredientsError,
    );
    expect(useScanStore.getState().current).toBeNull();
    expect(await listScans()).toEqual([]);
  });

  it("accepts a single typed ingredient when the minimum is 1", async () => {
    await completeScan("Butylparaben", "Butylparaben", { minIngredients: 1 });
    const current = useScanStore.getState().current!;
    expect(current.parsedIngredients).toEqual(["Butylparaben"]);
    expect(current.matches).toHaveLength(1);
  });

  it("still rejects empty text when the minimum is 1", async () => {
    await expect(completeScan("  ", "  ", { minIngredients: 1 })).rejects.toBeInstanceOf(
      TooFewIngredientsError,
    );
  });

  it("treats a minimum of 0 as 1", async () => {
    await expect(completeScan("", "", { minIngredients: 0 })).rejects.toBeInstanceOf(
      TooFewIngredientsError,
    );
  });

  it("still shows results when history can't be saved", async () => {
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    expect(await completeScan(LABEL, LABEL)).toBeNull();
    expect(useScanStore.getState().current?.matches).toHaveLength(1);
  });

  it("keeps an id on an unsaved scan, so a late commit lines up with History", async () => {
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    await completeScan(LABEL, LABEL);
    expect(useScanStore.getState().current?.id).toEqual(expect.any(String));
  });
});

describe("scanImage", () => {
  it("runs OCR then completes the scan", async () => {
    vi.mocked(recogniseText).mockResolvedValue({ rawText: LABEL, text: LABEL, spots: [], ms: 5 });
    const id = await scanImage(crop, new AbortController().signal);
    expect(recogniseText).toHaveBeenCalledWith(crop);
    expect(useScanStore.getState().current?.id).toBe(id);
  });

  it("saves nothing and keeps the current scan if aborted during OCR", async () => {
    const previous = { id: "prev", createdAt: 1, ocrText: "", parsedIngredients: [], matches: [] };
    useScanStore.getState().setCurrentScan(previous);
    const controller = new AbortController();
    vi.mocked(recogniseText).mockImplementation(async () => {
      controller.abort();
      return { rawText: LABEL, text: LABEL, spots: [], ms: 5 };
    });
    await expect(scanImage(crop, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(useScanStore.getState().current).toBe(previous);
    expect(await listScans()).toEqual([]);
  });

  it("takes back the history entry if the user leaves while it saves", async () => {
    const previous = { id: "prev", createdAt: 1, ocrText: "", parsedIngredients: [], matches: [] };
    useScanStore.getState().setCurrentScan(previous);
    const controller = new AbortController();
    vi.mocked(recogniseText).mockResolvedValue({ rawText: LABEL, text: LABEL, spots: [], ms: 5 });
    // Abort as soon as the put is issued, i.e. mid-save.
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      controller.abort();
      return put.apply(this, args);
    });
    await expect(scanImage(crop, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(useScanStore.getState().current).toBe(previous);
    expect(await listScans()).toEqual([]);
  });

  it("passes OCR errors through", async () => {
    vi.mocked(recogniseText).mockRejectedValue(new Error("timed out"));
    await expect(scanImage(crop, new AbortController().signal)).rejects.toThrow("timed out");
  });
});

describe("forgetScan / forgetAllScans", () => {
  it("clears the current scan when it is the one deleted", async () => {
    const id = await completeScan(LABEL, LABEL);
    await forgetScan(id!);
    expect(useScanStore.getState().current).toBeNull();
    expect(await getScan(id!)).toBeUndefined();
  });

  it("keeps the current scan when a different one is deleted", async () => {
    const older = await completeScan(LABEL, LABEL);
    const newer = await completeScan(LABEL, LABEL);
    await forgetScan(older!);
    expect(useScanStore.getState().current?.id).toBe(newer);
  });

  it("clears the scan in memory even when history is unavailable", async () => {
    await completeScan(LABEL, LABEL);
    const id = useScanStore.getState().current!.id!;
    vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(() => {
      throw new DOMException("Broken", "UnknownError");
    });
    vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => {
      throw new DOMException("Broken", "UnknownError");
    });
    await expect(forgetAllScans()).rejects.toThrow();
    expect(useScanStore.getState().current).toBeNull();

    await completeScan(LABEL, LABEL);
    const again = useScanStore.getState().current!.id!;
    expect(again).not.toBe(id);
    await expect(forgetScan(again)).rejects.toThrow();
    expect(useScanStore.getState().current).toBeNull();
  });

  it("delete-all succeeds in a private window where nothing is stored", async () => {
    // A fresh module graph, as a private window never has a cached connection.
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("blocked in private mode");
      },
    });
    vi.resetModules();
    const fresh = await import("./scan");
    const { useScanStore: store } = await import("@/lib/store/scanStore");
    expect(await fresh.completeScan(LABEL, LABEL)).toBeNull();
    expect(store.getState().current).not.toBeNull();
    await expect(fresh.forgetAllScans()).resolves.toBeUndefined();
    expect(store.getState().current).toBeNull();
  });

  it("delete-all clears history and the scan in memory", async () => {
    await completeScan(LABEL, LABEL);
    await forgetAllScans();
    expect(useScanStore.getState().current).toBeNull();
    expect(await listScans()).toEqual([]);
  });
});

describe("matchesFromDoc", () => {
  const doc: ScanDoc = {
    id: "d",
    createdAt: 1,
    ocrText: "",
    parsedIngredients: [],
    appVersion: "test",
    substancesDbVersion: "old",
    matches: [
      {
        substanceId: "no-longer-in-the-db",
        canonicalName: "Retired Substance",
        evidenceTier: 2,
        matchedAlias: "retired substance",
        matchedIngredient: "Retired Substance",
        ingredientPosition: 0,
        matchType: "exact",
        confidence: 1,
      },
    ],
  };

  it("keeps a match whose substance has left the database, using the stored name", () => {
    const [m] = matchesFromDoc(doc);
    expect(m).toMatchObject({
      substance: { id: "no-longer-in-the-db", canonicalName: "Retired Substance", evidenceTier: 2 },
      matchedIngredient: "Retired Substance",
    });
  });

  it("uses the current database entry when the substance still exists", async () => {
    const id = await completeScan(LABEL, LABEL);
    const stored = await getScan(id!);
    const [m] = matchesFromDoc(stored!);
    expect(m!.substance.casNumber).toBe("94-26-8");
    expect(m!.substance.aliases.length).toBeGreaterThan(0);
  });
});
