# data-pipeline

Node ETL that builds `app/src/data/substances.json` and
`substances-index.json`.

## Quick start

```bash
npm install
npm run build-seed          # offline seed — 30 curated substances
npm start                   # full pipeline: fetch + parse + enrich + write
```

## Pipeline steps

1. `fetchEdLists` — downloads Lists I, II, III as XLSX from edlists.org
2. `parseLists`   — parses rows via ExcelJS
3. `dedupe`       — groups by CAS (or normalised name), picks canonical name
4. `enrichCosing` — maps CAS → INCI name + synonyms from the CosIng CSV
                    (place at `data/raw/cosing.csv`; skipped if missing)
5. `enrichPubchem`— fetches additional synonyms from PubChem, cached per-CAS
6. `buildSubstancesJson` — writes the two JSON files the app bundles

## Flags

- `--skip-fetch`    reuse xlsx already in `data/raw/`
- `--skip-pubchem`  skip PubChem synonym enrichment

## Cache

PubChem responses are cached at `data/cache/pubchem/{cas}.json`. Re-running
the pipeline should produce no network traffic for previously-fetched CAS
numbers. Rate limit is 5 requests/second.

## Output shape

See `src/types.ts`. `Substance.aliases` is the master list of strings the
matcher will hit against; it includes the canonical name, any parenthesised
abbreviations, CosIng INCI synonyms, and filtered PubChem synonyms.

## When to re-run

edlists.org updates biannually (next expected April 2026). Run the pipeline,
inspect the diff, commit `app/src/data/substances*.json`, ship a new app
version.
