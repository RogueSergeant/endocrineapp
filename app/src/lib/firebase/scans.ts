import { firestore } from "./client";
import { currentUid } from "./auth";
import type { Match, ScanDoc, StoredMatch } from "../../types";

const SCANS = "scans";

function requireUid(): string {
  const uid = currentUid();
  if (!uid) throw new Error("no anonymous user — call ensureAnonymousUser() first");
  return uid;
}

function scansCol(uid: string) {
  return firestore().collection("users").doc(uid).collection(SCANS);
}

export function denormaliseMatches(matches: Match[]): StoredMatch[] {
  return matches.map((m) => ({
    substanceId: m.substance.id,
    canonicalName: m.substance.canonicalName,
    evidenceTier: m.substance.evidenceTier,
    matchedAlias: m.matchedAlias,
    matchedIngredient: m.matchedIngredient,
    ingredientPosition: m.ingredientPosition,
    matchType: m.matchType,
    confidence: m.confidence,
  }));
}

export interface SaveScanInput {
  ocrText: string;
  parsedIngredients: string[];
  matches: StoredMatch[];
  imageStoragePath: string | null;
  appVersion: string;
  substancesDbVersion: string;
}

export async function saveScan(input: SaveScanInput): Promise<string> {
  const uid = requireUid();
  const ref = scansCol(uid).doc();
  const doc: ScanDoc = {
    id: ref.id,
    createdAt: Date.now(),
    ...input,
  };
  await ref.set({
    ...doc,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function listScans(limit = 50): Promise<ScanDoc[]> {
  const uid = requireUid();
  const snap = await scansCol(uid).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt ?? Date.now(),
      ocrText: data.ocrText ?? "",
      parsedIngredients: data.parsedIngredients ?? [],
      matches: data.matches ?? [],
      imageStoragePath: data.imageStoragePath ?? null,
      appVersion: data.appVersion ?? "unknown",
      substancesDbVersion: data.substancesDbVersion ?? "unknown",
    } satisfies ScanDoc;
  });
}

export async function deleteScan(id: string): Promise<void> {
  const uid = requireUid();
  await scansCol(uid).doc(id).delete();
}

export async function deleteAllScans(): Promise<void> {
  const uid = requireUid();
  const snap = await scansCol(uid).limit(500).get();
  const batch = firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
