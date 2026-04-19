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

### 2. Run the app on your phone

The app uses native modules (Vision Camera, ML Kit, Firebase) so it cannot
run in Expo Go. You need a custom dev client. There are two ways to get one
onto your phone — pick whichever matches your setup.

#### Option A: EAS cloud build (no SDKs required)

Easiest if you don't have Xcode / Android Studio installed. Builds happen on
Expo's servers; you install the resulting APK / TestFlight build on your
phone and connect it to a metro bundler running on your laptop.

Prereqs: an Expo account (`npx expo login`) and a Firebase project (see §3).

```bash
cd app
npm install
npx eas-cli login
npx eas-cli init                          # one-time, sets the project ID in app.json
npx eas-cli build --profile development --platform android
# → wait ~10-20 min, then scan the QR / download the APK and sideload it
npx expo start --dev-client               # then open the dev client on your phone
```

For iOS, swap `--platform android` for `--platform ios`. iOS requires an
Apple Developer account ($99/yr) and your device's UDID registered with EAS.

#### Option B: Local build (faster iterations, requires SDKs)

Prereqs: Xcode (iOS, macOS only) or Android Studio (Android), CocoaPods on
macOS, your phone connected over USB with developer mode on.

```bash
cd app
npm install
npx expo prebuild
npx expo run:android --device           # or run:ios --device
```

ML Kit on iOS requires CocoaPods to install native dependencies after
`expo prebuild`. Run `cd ios && pod install` if `expo run:ios` does not do
it for you.

### 3. Firebase setup (required before first build)

Create a Firebase project at https://console.firebase.google.com, enable:

- Firestore (production mode, region `europe-west3`)
- Anonymous Authentication
- Cloud Storage

Then add an Android app with package name `com.edscanner.app` and download
`google-services.json` into `app/`. Add an iOS app with bundle id
`com.edscanner.app` and put `GoogleService-Info.plist` into `app/ios/` (or
`app/` — Expo's prebuild moves it). Both files are gitignored.

Deploy the security rules:

```bash
npx firebase-tools deploy --only firestore:rules,storage:rules
```

For local development, install the Firebase CLI and run
`npx firebase-tools emulators:start` from the project root, then set
`EXPO_PUBLIC_USE_FIRESTORE_EMULATOR=1` in `app/.env`.

> Without these config files the Android build fails at the
> `google-services` Gradle plugin step. iOS will build but crash on first
> Firebase API call.

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
