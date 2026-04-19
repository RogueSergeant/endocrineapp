# Data pipeline

ETL that produces the substance database bundled into the app.

```bash
npm install
npm start
```

This will:

1. Download Lists I, II, and III from edlists.org as XLSX into
   `data/raw/`.
2. Parse and merge them by CAS number.
3. (Optional) enrich with INCI names from a CosIng CSV dump in
   `data/cosing/` — the EU Cosmetic Ingredient Database CSV.
   Get it from https://ec.europa.eu/growth/tools-databases/cosing/.
4. Enrich each CAS-bearing substance with PubChem synonyms (cached on
   disk, capped at 20 synonyms each, rate-limited to 5 req/s).
5. Write `app/src/data/substances.json` and
   `app/src/data/substances-index.json`.

## Environment switches

| Variable | Effect |
|---|---|
| `ED_USE_SEED=1` | Skip the live fetch and use the curated seed dataset in `src/seed.ts`. Useful for offline/CI environments. |
| `ED_NETWORK=0` | Skip PubChem enrichment. |
| `ED_SOURCE_LAST_UPDATED=2026-04` | Override the `sourceLastUpdated` field written into `substances.json`. |

## Cache

PubChem responses are cached as `data/cache/{cas}.json`. The cache is
gitignored. Re-runs of the pipeline read from the cache before hitting
the network, so they are fast and respectful.

## CosIng dump

CosIng is a ~30k-row CSV that we never ship to the app. The pipeline
only uses it to enrich the ~300 ED-listed substances we care about with
their INCI names. Drop the downloaded CSV(s) into `data/cosing/` and
re-run `npm start`. The pipeline detects them automatically.

## Output schema

See `src/types.ts` (`SubstancesFile`, `SubstancesIndex`).

`substances-index.json` is a precomputed flat map from normalised alias
→ substance UUID, ready for O(1) lookup at runtime.
