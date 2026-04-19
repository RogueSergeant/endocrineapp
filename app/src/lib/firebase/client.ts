import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

let configured = false;

/**
 * Wire up Firebase emulators when EXPO_PUBLIC_USE_FIRESTORE_EMULATOR=1.
 * Idempotent — safe to call multiple times.
 */
export function configureFirebase(): void {
  if (configured) return;
  configured = true;
  if (process.env.EXPO_PUBLIC_USE_FIRESTORE_EMULATOR === "1") {
    const host = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
    const port = Number(process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080");
    firestore().useEmulator(host, port);
    const authUrl = process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099";
    auth().useEmulator(authUrl);
  }
}

export { auth, firestore };
