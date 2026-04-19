import { loadSeedSubstances } from "./seed/seedSubstances.ts";
import { writeSubstancesJson } from "./buildSubstancesJson.ts";

async function main(): Promise<void> {
  const substances = await loadSeedSubstances();
  console.log(`[seed] writing ${substances.length} seed substances`);
  await writeSubstancesJson(substances, "2025-12");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
