import type { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { auth } from "./client";

/**
 * Ensure the user is signed in anonymously. Resolves to the uid.
 * Safe to call on every app launch — no-op when already signed in.
 */
export async function ensureAnonymousAuth(): Promise<string> {
  const current = auth().currentUser;
  if (current) return current.uid;
  const credentials = await auth().signInAnonymously();
  return credentials.user.uid;
}

export function onAuthChange(
  cb: (user: FirebaseAuthTypes.User | null) => void,
): () => void {
  return auth().onAuthStateChanged(cb);
}

export function currentUid(): string | null {
  return auth().currentUser?.uid ?? null;
}
