# Endocrine Disruptor Scanner (MVP)

Cross-platform mobile app that scans cosmetic ingredient lists, identifies endocrine
disruptors using the [edlists.org](https://edlists.org) knowledge base, and keeps a
history of scans.

## Repository layout

```
endocrineapp/
├── app/             React Native (Expo dev-client) app
├── data-pipeline/   Node.js ETL that builds app/src/data/substances.json
├── functions/       Firebase Cloud Functions (placeholder, post-MVP)
└── .github/         CI workflows
```

`app` and `data-pipeline` are independent Node projects with their own
`package.json`. They are wired together by the JSON file the pipeline writes
into `app/src/data/`.

## Quick start

### 1. Build the substance database

```bash
cd data-pipeline
npm install
npm start
```

This downloads the three edlists.org spreadsheets, deduplicates by CAS,
enriches with INCI names from CosIng and synonyms from PubChem, and writes:

- `app/src/data/substances.json`
- `app/src/data/substances-index.json`

The PubChem responses are cached under `data-pipeline/data/cache/` so re-runs
are fast and respectful of the API.

### 2. Run the app

Prerequisites: Xcode (iOS) or Android Studio (Android), CocoaPods on macOS,
an Expo account for `eas build`, a Firebase project.

```bash
cd app
npm install
cp .env.example .env            # then fill in your Firebase config
npx expo prebuild
npx expo run:ios                # or run:android
```

ML Kit on iOS requires CocoaPods to install native dependencies after
`expo prebuild`. Run `cd ios && pod install` if `expo run:ios` does not do
it for you.

### 3. Firebase setup

Create a Firebase project, enable:

- Firestore (production mode, region `europe-west3`)
- Anonymous Authentication
- Cloud Storage

Drop `google-services.json` into `app/` and `GoogleService-Info.plist` into
`app/ios/`. Both files are gitignored.

For local development, install the Firebase CLI and run
`firebase emulators:start` from the project root.

## Tests

```bash
cd app
npm test                # Jest unit tests including matcher.test.ts
npm run typecheck
npm run lint
```

The matching engine in `app/src/lib/matching/` is fully unit-tested and
framework-free.

## Data sources and attribution

- Substance lists: [edlists.org](https://edlists.org) (Lists I, II, III)
- INCI mapping: [EU CosIng](https://ec.europa.eu/growth/tools-databases/cosing/)
- Synonym enrichment: [PubChem](https://pubchem.ncbi.nlm.nih.gov/)

This app is **not medical advice**. It surfaces substances that the listed
authorities have flagged or are evaluating; the absence of a flag does not
mean a product is safe.

## Out of scope (v1.1+)

Barcode scanning, alternatives suggestions, accounts/login, food and
non-cosmetic categories, scoring systems, push notifications, scheduled ETL,
multi-language UI.
