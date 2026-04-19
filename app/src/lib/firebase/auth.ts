import { auth } from "./client";

export async function ensureAnonymousUser(): Promise<string> {
  const current = auth().currentUser;
  if (current) return current.uid;
  const credential = await auth().signInAnonymously();
  return credential.user.uid;
}

export function currentUid(): string | null {
  return auth().currentUser?.uid ?? null;
}
