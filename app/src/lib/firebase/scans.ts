import firestore from "@react-native-firebase/firestore";
import type { Match, ScanDoc, StoredMatch } from "@/types";
import { currentUid } from "./auth";

const APP_VERSION = "0.1.0";

function scansCollection(uid: string) {
  return firestore().collection("users").doc(uid).collection("scans");
}

export function denormaliseMatch(match: Match): StoredMatch {
  return {
    substanceId: match.substance.id,
    canonicalName: match.substance.canonicalName,
    evidenceTier: match.substance.evidenceTier,
    matchedAlias: match.matchedAlias,
    matchedIngredient: match.matchedIngredient,
    ingredientPosition: match.ingredientPosition,
    matchType: match.matchType,
    confidence: match.confidence,
  };
}

export interface CreateScanInput {
  ocrText: string;
  parsedIngredients: string[];
  matches: Match[];
  imageStoragePath: string | null;
  substancesDbVersion: string;
}

export async function saveScan(input: CreateScanInput): Promise<ScanDoc> {
  const uid = currentUid();
  if (!uid) throw new Error("Not signed in");
  const docRef = scansCollection(uid).doc();
  const doc: ScanDoc = {
    id: docRef.id,
    createdAt: Date.now(),
    ocrText: input.ocrText,
    parsedIngredients: input.parsedIngredients,
    matches: input.matches.map(denormaliseMatch),
    imageStoragePath: input.imageStoragePath,
    appVersion: APP_VERSION,
    substancesDbVersion: input.substancesDbVersion,
  };
  await docRef.set({
    ...doc,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return doc;
}

export async function listScans(limit = 50): Promise<ScanDoc[]> {
  const uid = currentUid();
  if (!uid) return [];
  const snap = await scansCollection(uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => fromSnapshot(d.data()));
}

export async function deleteScan(id: string): Promise<void> {
  const uid = currentUid();
  if (!uid) throw new Error("Not signed in");
  await scansCollection(uid).doc(id).delete();
}

export async function deleteAllScans(): Promise<void> {
  const uid = currentUid();
  if (!uid) throw new Error("Not signed in");
  const snap = await scansCollection(uid).get();
  const batch = firestore().batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

function fromSnapshot(data: Record<string, unknown>): ScanDoc {
  const createdAt = data["createdAt"];
  let ts: number = Date.now();
  if (
    createdAt &&
    typeof createdAt === "object" &&
    "toMillis" in createdAt &&
    typeof (createdAt as { toMillis: () => number }).toMillis === "function"
  ) {
    ts = (createdAt as { toMillis: () => number }).toMillis();
  } else if (typeof createdAt === "number") {
    ts = createdAt;
  }
  return {
    id: String(data["id"] ?? ""),
    createdAt: ts,
    ocrText: String(data["ocrText"] ?? ""),
    parsedIngredients: (data["parsedIngredients"] as string[] | undefined) ?? [],
    matches: (data["matches"] as StoredMatch[] | undefined) ?? [],
    imageStoragePath: (data["imageStoragePath"] as string | null | undefined) ?? null,
    appVersion: String(data["appVersion"] ?? APP_VERSION),
    substancesDbVersion: String(data["substancesDbVersion"] ?? ""),
  };
}
