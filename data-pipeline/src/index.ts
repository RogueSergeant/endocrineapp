import { fetchAllLists } from "./fetchEdLists.ts";
import { parseAllLists } from "./parseLists.ts";
import { dedupe } from "./dedupe.ts";
import { enrichWithCosing } from "./enrichCosing.ts";
import { enrichWithPubchem } from "./enrichPubchem.ts";
import { writeSubstancesJson } from "./buildSubstancesJson.ts";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const skipFetch = args.has("--skip-fetch");
  const skipPubchem = args.has("--skip-pubchem");
  const sourceLastUpdated =
    process.env.ED_SOURCE_UPDATED ?? new Date().toISOString().slice(0, 7);

  if (!skipFetch) {
    await fetchAllLists();
  } else {
    console.log("[main] --skip-fetch: using existing xlsx in data/raw");
  }

  const rawRows = await parseAllLists();
  console.log(`[main] parsed ${rawRows.length} raw rows`);

  let substances = dedupe(rawRows);
  console.log(`[main] deduped to ${substances.length} substances`);

  substances = await enrichWithCosing(substances);

  if (!skipPubchem) {
    substances = await enrichWithPubchem(substances);
  } else {
    console.log("[main] --skip-pubchem: skipping synonym enrichment");
  }

  await writeSubstancesJson(substances, sourceLastUpdated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
