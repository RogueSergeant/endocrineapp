# ED Scanner

A website that checks cosmetic ingredient lists for endocrine disruptors,
using the [edlists.org](https://edlists.org) lists. Take a photo of a label
on your phone and the site reads it **on the device**: the photo is never
uploaded. It will live at **https://endoscan.alfieroberts.co.uk**.

## Repository layout

```
endocrineapp/
├── web/             The website (Vite + React + TypeScript)
├── data-pipeline/   Node ETL that builds web/src/data/substances*.json
└── .github/         CI and the substance-update workflow
```

## How it works

1. **Photo**: a normal file input (`capture="environment"`), so it uses the
   phone's own camera app. A paste box is the fallback: on iPhone, tap it
   and choose *Scan Text* (Live Text); on Android, paste from Google Lens.
2. **Crop**: the user drags a box over the ingredient list.
3. **Straighten**: the crop is deskewed automatically
   (`web/src/lib/ocr/deskew.ts`). Even a 1.5 degree tilt wrecks OCR on long
   lines, and phone photos are never perfectly level.
4. **Read**: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-OCRv5
   mobile models (English) run in a Web Worker on
   [onnxruntime-web](https://onnxruntime.ai/) via
   [ppu-paddle-ocr](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr).
   It takes about 1.5 s on a laptop; expect a few seconds on a phone.
5. **Match**: the ingredient parser and matcher in
   `web/src/lib/matching/` compare each ingredient against ~200 listed
   substances (exact, CAS number, or OCR-tolerant fuzzy match).
6. **History**: scans are kept in the browser's IndexedDB. There are no
   accounts and no backend.

The first visit downloads ~13 MB of models and a ~14 MB WASM runtime
(~3.7 MB compressed). After that they are cached, and the site works
offline.

## Run it locally

Requires Node 20+ (22 recommended).

```bash
cd web
npm install
npm run dev          # http://localhost:5173, also on your LAN for phone testing
```

`npm run dev` and `npm run build` first run `scripts/fetch-models.mjs`, which
downloads the OCR models into `web/public/models/` (gitignored) and checks
their SHA-256 hashes. Later runs skip files that are already present.

To try it on your phone, open the LAN address Vite prints. Over plain HTTP
the browser disables the service worker and multi-threaded WASM, so OCR
runs on one thread (slower, but it works). The deployed HTTPS site has
both.

## Deploy (Cloudflare Workers, from your Mac)

The site is a static-assets-only Worker; `web/wrangler.jsonc` holds the
config, including the custom domain `endoscan.alfieroberts.co.uk`.

Prerequisite: the `alfieroberts.co.uk` zone must be on the same Cloudflare
account. Wrangler creates the DNS record and certificate on the first deploy.

```bash
cd web
npm install
npx wrangler login   # once; opens a browser
npm run build
npm run deploy       # wrangler deploy
```

`web/public/_headers` sets the cross-origin isolation headers
(`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`) that let
the OCR use several threads, plus long cache lifetimes for the models and
hashed assets. To check the config without deploying, run
`npx wrangler deploy --dry-run` (CI does this too).

## Tests

```bash
cd web
npm test             # Vitest: matcher, parser, deskew, real-data regressions
npm run typecheck
npm run lint
```

`src/lib/matching/substanceData.test.ts` checks that common label spellings
(BUTYLPARABEN, Methylparaben, Benzophenone-3, Cyclopentasiloxane, ...)
match the right entries in the real bundled database.

## Updating the substance data

```bash
cd data-pipeline
npm install
npm start
```

This reads the three edlists.org spreadsheets committed in
`data-pipeline/data/raw/`, merges them by CAS number, splits multi-name
cells into separate aliases, adds PubChem synonyms, and writes
`web/src/data/substances.json` and `substances-index.json`. See
`data-pipeline/README.md` for details. The *Update substance database*
GitHub workflow does the same and commits the result; redeploy afterwards.

## Data sources and attribution

- Substance lists: [edlists.org](https://edlists.org) (Lists I, II, III)
- Synonym enrichment: [PubChem](https://pubchem.ncbi.nlm.nih.gov/)
- INCI mapping (optional): [EU CosIng](https://ec.europa.eu/growth/tools-databases/cosing/)
- Text recognition: PaddleOCR models (Apache-2.0), ONNX conversions from
  [ppu-paddle-ocr-models](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models)

This site is **not medical advice**. It surfaces substances that the listed
authorities have flagged or are evaluating; the absence of a flag does not
mean a product is safe.
