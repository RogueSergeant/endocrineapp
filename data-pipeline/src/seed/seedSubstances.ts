import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Substance } from "../types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SEED_JSON = join(here, "..", "..", "scripts", "seedSubstances.json");

export async function loadSeedSubstances(): Promise<Substance[]> {
  const text = await readFile(SEED_JSON, "utf8");
  return JSON.parse(text) as Substance[];
}
