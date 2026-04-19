import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import storage from "@react-native-firebase/storage";

/**
 * The @react-native-firebase SDK is initialised automatically from the
 * GoogleService-Info.plist (iOS) / google-services.json (Android) files
 * added during `expo prebuild`. This module exposes the SDK handles so
 * callers can swap in emulators during local dev.
 */

let emulatorsWired = false;

export function wireEmulators(host = "127.0.0.1"): void {
  if (emulatorsWired) return;
  try {
    auth().useEmulator(`http://${host}:9099`);
    firestore().useEmulator(host, 8080);
    storage().useEmulator(host, 9199);
    emulatorsWired = true;
  } catch (err) {
    console.warn("[firebase] emulator wire-up failed", err);
  }
}

export { auth, firestore, storage };
