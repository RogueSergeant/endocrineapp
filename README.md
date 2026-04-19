# Endocrine Disruptor Scanner (MVP)

Mobile app that reads cosmetic ingredient labels with the phone camera, flags
substances listed on [edlists.org](https://edlists.org), and keeps a history
of scans. On-device OCR, anonymous Firebase per-device storage.

> MVP scope. No barcode scanning, no "safe alternatives", no login. See
> `BUILD_BRIEF.md` for the scope lines we agreed on.

---

## Repo layout

```
ed-scanner/
├── app/              # Expo React Native app (TypeScript)
├── data-pipeline/    # Node ETL that builds app/src/data/substances.json
├── firestore.rules
├── storage.rules
├── firebase.json     # Firebase config + emulator ports
└── .github/workflows # CI: typecheck + lint + tests
```

Two independent Node projects, each with their own `package.json`.

---

## Prerequisites

- Node 20+
- Xcode 15+ with a recent CocoaPods (for iOS builds)
- Android Studio with API 34+ SDK (for Android builds)
- Firebase CLI: `npm i -g firebase-tools`
- Expo CLI is bundled via `npx` — no global install required

---

## 1. Build the substance database

```bash
cd data-pipeline
npm install

# Option A — seed only (offline-friendly; ships with the 30-substance curated seed)
npm run build-seed

# Option B — full ETL (requires network + CosIng CSV)
#   1. Download CosIng CSV from the EU site, save it as
#      data-pipeline/data/raw/cosing.csv
#   2. Run:
npm start                # fetches edlists.org → parses → enriches → writes JSON

# Useful flags:
#   --skip-fetch       reuse xlsx already in data/raw/
#   --skip-pubchem     skip synonym enrichment (useful for offline tests)
```

Output:

- `app/src/data/substances.json` — source-of-truth bundled with the app
- `app/src/data/substances-index.json` — precomputed alias → id lookup

Commit both files whenever the database changes; the app loads them from bundle.

### ETL re-run cadence

edlists.org updates biannually. Re-run the pipeline, commit the new JSON, ship
a new app version. A scheduled Cloud Function is v2.

---

## 2. Firebase setup

1. Create a Firebase project in the console.
2. Enable: Firestore (region `europe-west3` recommended), Anonymous
   Authentication, Cloud Storage.
3. Download the platform config files:
   - iOS: `GoogleService-Info.plist` → `app/GoogleService-Info.plist`
   - Android: `google-services.json` → `app/google-services.json`
4. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
5. Local dev with emulators:
   ```bash
   firebase emulators:start
   # Then in the app, call wireEmulators() at startup (see app/src/lib/firebase/client.ts)
   ```

The rules enforce per-user isolation: `users/{uid}/scans/{scanId}` is only
accessible by the user whose `auth.uid == uid`.

---

## 3. App setup

```bash
cd app
npm install --legacy-peer-deps

# Generate native projects (iOS + Android). Required because ML Kit and
# Vision Camera are native modules — you can't use Expo Go.
npx expo prebuild

# iOS: install CocoaPods after prebuild (CRITICAL for ML Kit)
cd ios && pod install && cd ..

# Run
npm run ios        # iOS simulator
npm run android    # Android emulator
```

### Dev build notes

- We use the Expo dev-client workflow. You **cannot** use Expo Go — ML Kit
  and Vision Camera ship native code.
- On a fresh clone, always run `npx expo prebuild` before the first
  `npm run ios` / `npm run android`.
- If you see "Unable to resolve @react-native-firebase/app", run
  `cd ios && pod install` again — native module linking on iOS runs via
  CocoaPods post-prebuild.

---

## 4. Running tests

```bash
cd app
npm test                    # matcher + parser unit tests
npm run typecheck
npm run lint
```

The matching engine is pure TS with no native deps — unit tests are the
fast feedback loop. Test fixtures live in `app/src/lib/matching/matcher.test.ts`.

---

## 5. Architecture decisions

- **Why denormalise matches into scan docs?** The substance DB ships in the
  app bundle, so when users open a historic scan after an app update that
  changed substance IDs, the stored match is self-contained. Links back to
  `SubstanceDetailScreen` are best-effort.
- **Why ship `substances-index.json`?** Pre-computing the normalised alias →
  id map at build time avoids a cold-start hit of iterating ~300 substances
  × ~20 aliases at app launch.
- **Why anonymous auth only?** MVP scope. Reinstalling the app loses the
  anonymous UID and its history; that's acceptable until v1.1 where we can
  add "back up my data".
- **Why conservative fuzzy matching?** `BHA` is a 3-char alias — a fuzzy
  match on anything starting with `b` would catch it. We require
  length ≥ 8 and Levenshtein ≤ 2, and surface `matchType` in the UI so
  users can judge confidence.

---

## 6. Data sources and attribution

- Substance lists: [edlists.org](https://edlists.org) — Lists I, II, III
- INCI enrichment: [EU CosIng database](https://ec.europa.eu/growth/tools-databases/cosing/)
- Synonyms: [PubChem PUG REST API](https://pubchem.ncbi.nlm.nih.gov/rest/pug/)

The app is not affiliated with any of these sources. Always display the
source + last-updated date next to any flag (see the ResultsScreen footer).

---

## 7. Done-when checklist

See section 9 of the build brief. The short version:

- [x] Data pipeline runs end-to-end; substances.json + index shipped
- [x] Matcher has unit tests covering exact, CAS, fuzzy, safe staples
- [x] Scan → OCR → match → Results flow implemented
- [x] Per-user Firestore history with proper rules
- [x] Anonymous auth, no login UI
- [x] Camera permission rationale screen
- [ ] `npm run typecheck && npm run lint` pass after `npm install`
      (run locally; CI is wired up in `.github/workflows/ci.yml`)
