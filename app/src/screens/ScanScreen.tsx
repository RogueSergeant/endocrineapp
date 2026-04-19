import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useTextRecognition } from "../lib/ocr/useTextRecognition";
import { parseIngredients } from "../lib/matching/ingredientParser";
import { matchIngredients } from "../lib/matching/matcher";
import {
  SUBSTANCES,
  SUBSTANCES_DB_VERSION,
  SUBSTANCES_INDEX,
} from "../lib/matching/substances";
import { denormaliseMatches, saveScan } from "../lib/firebase/scans";
import { useScanStore } from "../lib/store/scanStore";
import { APP_VERSION } from "../lib/config";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

export function ScanScreen({ navigation }: Props): React.ReactElement {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const camera = useRef<Camera>(null);
  const { recognise } = useTextRecognition();
  const [busy, setBusy] = useState(false);
  const setLast = useScanStore((s) => s.setLast);

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const onCapture = useCallback(async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePhoto({ enableShutterSound: false });
      const uri = `file://${photo.path}`;
      const ocr = await recognise(uri);
      const parsed = parseIngredients(ocr.cleaned);

      if (parsed.length < 3) {
        Alert.alert(
          "Couldn’t read that",
          "Try again with better lighting and the label flat in the frame.",
        );
        return;
      }

      const matches = matchIngredients({
        ingredients: parsed,
        index: SUBSTANCES_INDEX,
        substances: SUBSTANCES,
      });

      let scanId: string | null = null;
      try {
        scanId = await saveScan({
          ocrText: ocr.cleaned,
          parsedIngredients: parsed,
          matches: denormaliseMatches(matches),
          imageStoragePath: null,
          appVersion: APP_VERSION,
          substancesDbVersion: SUBSTANCES_DB_VERSION,
        });
      } catch (err) {
        console.warn("[scan] save queued while offline", err);
      }

      setLast({ ocrText: ocr.cleaned, parsed, matches, scanId });
      navigation.navigate("Results", { scanId });
    } catch (err) {
      console.error(err);
      Alert.alert("Scan failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [busy, navigation, recognise, setLast]);

  if (!hasPermission) {
    return (
      <View style={styles.permWrap}>
        <Text style={styles.permTitle}>Camera permission needed</Text>
        <Text style={styles.permBody}>
          We need camera access to scan ingredient lists. The image never leaves
          your device — OCR runs locally.
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.permWrap}>
        <Text style={styles.permBody}>No camera available on this device.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
      />
      <View style={styles.topBar}>
        <Text style={styles.title}>Scan ingredients</Text>
        <Pressable
          onPress={() => navigation.navigate("History")}
          hitSlop={16}
          accessibilityLabel="View history"
        >
          <Text style={styles.historyLink}>History</Text>
        </Pressable>
      </View>
      <View style={styles.instructionBand}>
        <Text style={styles.instruction}>Point at the ingredient list</Text>
      </View>
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.shutter}
          onPress={onCapture}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Capture"
        >
          {busy ? <ActivityIndicator color="#1A202C" /> : <View style={styles.shutterInner} />}
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          hitSlop={16}
          style={styles.settingsLinkWrap}
        >
          <Text style={styles.settingsLink}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: "#FFF", fontSize: 20, fontWeight: "700" },
  historyLink: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  instructionBand: {
    position: "absolute",
    top: "45%",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  instruction: {
    color: "#FFF",
    fontSize: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bottomBar: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F7FAFC",
  },
  settingsLinkWrap: { marginTop: 16 },
  settingsLink: { color: "#FFF", fontSize: 14 },
  permWrap: {
    flex: 1,
    backgroundColor: "#1A202C",
    padding: 24,
    justifyContent: "center",
  },
  permTitle: { color: "#FFF", fontSize: 22, fontWeight: "700", marginBottom: 10 },
  permBody: { color: "#E2E8F0", fontSize: 15, lineHeight: 22 },
  permButton: {
    marginTop: 24,
    alignSelf: "flex-start",
    backgroundColor: "#3182CE",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});
