import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import { colors, radii, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Scan">;

export function ScanScreen({ navigation }: Props) {
  const camera = useRef<CameraView>(null);
  const capturing = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  const handleCapture = useCallback(async () => {
    if (capturing.current || !camera.current) return;
    capturing.current = true;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("No image returned from camera");
      navigation.navigate("Crop", {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });
    } catch (err) {
      Alert.alert("Capture failed", (err as Error).message);
    } finally {
      setBusy(false);
      capturing.current = false;
    }
  }, [navigation]);

  if (!permission) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    if (permission.canAskAgain) {
      return (
        <View style={styles.fullCenter}>
          <Text style={styles.permissionTitle}>Camera permission needed</Text>
          <Text style={styles.permissionBody}>
            ED Scanner reads ingredient lists from product packaging. We never
            upload your photos.
          </Text>
          <Pressable
            style={styles.permissionBtn}
            onPress={() => void requestPermission()}
          >
            <Text style={styles.permissionBtnText}>Grant access</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.permissionTitle}>Camera permission denied</Text>
        <Text style={styles.permissionBody}>
          Open Settings and enable the camera permission for ED Scanner.
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

  return (
    <View style={styles.container}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        autofocus="on"
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
