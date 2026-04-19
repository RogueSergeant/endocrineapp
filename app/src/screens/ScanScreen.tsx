import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
} from "react-native-vision-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { matchIngredients } from "@/lib/matching/matcher";
import { currentUid } from "@/lib/firebase/auth";
import { saveScan } from "@/lib/firebase/scans";
import { substanceDb, useScanStore } from "@/lib/store/scanStore";
import { colors, radii, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

export function ScanScreen({ navigation }: Props) {
  const camera = useRef<Camera>(null);
  const capturing = useRef(false);
  const { hasPermission, requestPermission } = useCameraPermission();
  const hookDevice = useCameraDevice("back");
  const [fallbackDevice, setFallbackDevice] = useState<CameraDevice | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const setCurrentScan = useScanStore((s) => s.setCurrentScan);
  const device = hookDevice ?? fallbackDevice;

  useEffect(() => {
    let cancelled = false;
    if (hasPermission) return;
    (async () => {
      const granted = await requestPermission();
      if (cancelled) return;
      if (!granted) setDenied(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPermission, requestPermission]);

  // Force-enumerate devices if the hook hasn't returned one within a frame.
  // Vision Camera's useCameraDevice occasionally stays empty on launches
  // where permission was already granted (no permission-change event to
  // trigger re-enumeration). getAvailableCameraDevices() is a direct query.
  useEffect(() => {
    if (!hasPermission || hookDevice) return;
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const devices = Camera.getAvailableCameraDevices();
      const back =
        devices.find((d) => d.position === "back") ?? devices[0] ?? null;
      if (back) setFallbackDevice(back);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [hasPermission, hookDevice]);

  const handleCapture = useCallback(async () => {
    if (capturing.current || !camera.current) return;
    capturing.current = true;
    setBusy(true);
    const createdAt = Date.now();
    try {
      const photo = await camera.current.takePhoto({
        flash: "off",
        enableShutterSound: false,
      });
      const uri = `file://${photo.path}`;
      const { rawText, text } = await recogniseText(uri);
      const parsed = parseIngredients(text);
      if (parsed.length < 3) {
        Alert.alert(
          "Couldn't read that",
          "We only picked up a few words. Try again with better lighting and the whole list in frame.",
        );
        return;
      }
      const matches = matchIngredients(parsed, substanceDb.index, substanceDb.lookup);

      let scanId: string | null = null;
      if (currentUid()) {
        try {
          const saved = await saveScan({
            ocrText: rawText,
            parsedIngredients: parsed,
            matches,
            imageStoragePath: null,
            substancesDbVersion: substanceDb.version,
          });
          scanId = saved.id;
        } catch (err) {
          // Don't block the scan on a Firestore write error — the user
          // still gets their results locally. History will miss this
          // scan, which is better than losing the capture entirely.
          // eslint-disable-next-line no-console
          console.warn("saveScan failed, continuing offline:", err);
        }
      }

      setCurrentScan({
        id: scanId,
        createdAt,
        ocrText: rawText,
        parsedIngredients: parsed,
        matches,
      });
      navigation.navigate(
        "Results",
        scanId ? { scanId } : undefined,
      );
    } catch (err) {
      Alert.alert("Scan failed", (err as Error).message);
    } finally {
      setBusy(false);
      capturing.current = false;
    }
  }, [navigation, setCurrentScan]);

  if (!hasPermission && !denied) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator />
      </View>
    );
  }

  if (denied) {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.permissionTitle}>Camera permission needed</Text>
        <Text style={styles.permissionBody}>
          ED Scanner reads ingredient lists from product packaging. We never
          upload your photos.
        </Text>
        <Pressable
          style={styles.permissionBtn}
          onPress={() => void Linking.openSettings()}
        >
          <Text style={styles.permissionBtnText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator />
        <Text style={[styles.permissionBody, styles.loadingText]}>
          Loading camera…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          style={styles.topBtn}
          accessibilityLabel="History"
        >
          <Text style={styles.topBtnText}>History</Text>
        </Pressable>
      </View>
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.overlayText}>Point at the ingredient list</Text>
      </View>
      <View style={styles.bottomBar}>
        <Pressable
          onPress={() => void handleCapture()}
          style={[styles.shutter, busy && styles.shutterDisabled]}
          disabled={busy}
          accessibilityLabel="Capture"
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={styles.settingsBtn}
        >
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  fullCenter: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(6),
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing(2),
    textAlign: "center",
  },
  permissionBody: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing(4),
  },
  loadingText: {
    marginTop: spacing(3),
    marginBottom: 0,
  },
  permissionBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    borderRadius: radii.md,
  },
  permissionBtnText: {
    color: colors.accentText,
    fontWeight: "600",
  },
  topBar: {
    position: "absolute",
    top: spacing(12),
    left: spacing(4),
    right: spacing(4),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  topBtn: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    borderRadius: radii.pill,
  },
  topBtnText: { color: "#fff", fontWeight: "600" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
  },
  bottomBar: {
    position: "absolute",
    bottom: spacing(10),
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(3),
  },
  shutterDisabled: { opacity: 0.6 },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: colors.accent,
  },
  settingsBtn: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  settingsText: { color: "#fff", fontWeight: "500" },
});
