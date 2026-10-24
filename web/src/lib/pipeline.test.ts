// Whole paste flow against the real bundled database and a real (fake)
// IndexedDB: label text -> OCR cleanup -> parse -> match -> save -> list ->
// reload -> rehydrate. Catches breakage between the steps that the unit
// tests cover one at a time.
import "fake-indexeddb/auto";
import { deleteAllScans, getScan, listScans } from "@/lib/history";
import { cleanOcrOutput } from "@/lib/ocr/cleanOcrOutput";
import { useScanStore } from "@/lib/store/scanStore";
import { completeScan, matchesFromDoc } from "./scan";

const LABEL = `Ingredients: AQUA, HOMOSALATE, BENZOPHENONE-3, BUTYL METHOXYDIBENZOYLMETHANE,
GLYCERIN, CYCLOPENTASILOXANE, PROPYLPARABEN, BUTY1PARABEN, PARFUM.
May contain traces of nuts.`;

beforeEach(async () => {
  await deleteAllScans();
  useScanStore.getState().clearCurrentScan();
});

it("a pasted label is matched, saved, listed and reloaded with the same matches", async () => {
  const id = await completeScan(LABEL, cleanOcrOutput(LABEL), { minIngredients: 1 });
  expect(id).not.toBeNull();

  const current = useScanStore.getState().current!;
  const flagged = current.matches.map((m) => m.substance.casNumber).sort();
  expect(flagged).toEqual(
    ["131-57-7", "70356-09-1", "541-02-6", "94-13-3", "94-26-8"].sort(),
  );
  // The OCR slip in BUTY1PARABEN is caught by fuzzy matching.
  expect(current.matches.find((m) => m.substance.casNumber === "94-26-8")?.matchType).toBe(
    "fuzzy",
  );

  const [listed] = await listScans();
  expect(listed?.id).toBe(id);
  expect(listed?.matches).toHaveLength(current.matches.length);

  const reloaded = matchesFromDoc((await getScan(id!))!);
  expect(reloaded.map((m) => [m.substance.id, m.matchedIngredient, m.matchType])).toEqual(
    current.matches.map((m) => [m.substance.id, m.matchedIngredient, m.matchType]),
  );
});
