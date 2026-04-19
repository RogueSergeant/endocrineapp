import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import { recogniseText } from "@/lib/ocr/textRecognition";
import { parseIngredients } from "@/lib/matching/ingredientParser";
import { matchIngredients } from "@/lib/matching/matcher";
import { currentUid } from "@/lib/firebase/auth";
import { saveScan } from "@/lib/firebase/scans";
import { substanceDb, useScanStore } from "@/lib/store/scanStore";
import { colors, radii, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Crop">;

const HANDLE_SIZE = 28;
const MIN_RECT = 80;

// Compute the on-screen rect of a "contain"-fit image.
function containedRect(
  imgW: number,
  imgH: number,
  screenW: number,
  screenH: number,
): { x: number; y: number; w: number; h: number } {
  const imgAR = imgW / imgH;
  const screenAR = screenW / screenH;
  if (imgAR > screenAR) {
    const w = screenW;
    const h = w / imgAR;
    return { x: 0, y: (screenH - h) / 2, w, h };
  }
  const h = screenH;
  const w = h * imgAR;
  return { x: (screenW - w) / 2, y: 0, w, h };
}

export function CropScreen({ navigation, route }: Props) {
  const { uri, width: imgW, height: imgH } = route.params;
  const [busy, setBusy] = useState(false);
  const setCurrentScan = useScanStore((s) => s.setCurrentScan);

  // Available drawing area = full screen minus header / footer chrome.
  const screen = Dimensions.get("window");
  const headerH = 80;
  const footerH = 120;
  const drawAreaY = headerH;
  const drawAreaH = screen.height - headerH - footerH;
  const fit = useMemo(
    () => containedRect(imgW, imgH, screen.width, drawAreaH),
    [imgW, imgH, screen.width, drawAreaH],
  );

  // Initial selection: middle 90% × 35% of the image, biased downward
  // (ingredient lists usually live in the bottom half of a label).
  const initX = fit.x + fit.w * 0.05;
  const initW = fit.w * 0.9;
  const initH = fit.h * 0.35;
  const initY = fit.y + fit.h * 0.5 - initH / 2;

  const x = useSharedValue(initX);
  const y = useSharedValue(initY);
  const w = useSharedValue(initW);
  const h = useSharedValue(initH);

  // Worklets get their own copies of the bounds.
  const minX = fit.x;
  const minY = fit.y;
  const maxX = fit.x + fit.w;
  const maxY = fit.y + fit.h;

  const bodyPan = Gesture.Pan().onChange((e) => {
    "worklet";
    const nx = Math.max(minX, Math.min(maxX - w.value, x.value + e.changeX));
    const ny = Math.max(minY, Math.min(maxY - h.value, y.value + e.changeY));
    x.value = nx;
    y.value = ny;
  });

  // Each corner pan adjusts (x, y, w, h) so the opposite corner stays put.
  const cornerPan = (corner: "tl" | "tr" | "bl" | "br") =>
    Gesture.Pan().onChange((e) => {
      "worklet";
      let nx = x.value;
      let ny = y.value;
      let nw = w.value;
      let nh = h.value;
      if (corner === "tl") {
        nx = Math.max(minX, Math.min(x.value + w.value - MIN_RECT, x.value + e.changeX));
        ny = Math.max(minY, Math.min(y.value + h.value - MIN_RECT, y.value + e.changeY));
        nw = w.value - (nx - x.value);
        nh = h.value - (ny - y.value);
      } else if (corner === "tr") {
        ny = Math.max(minY, Math.min(y.value + h.value - MIN_RECT, y.value + e.changeY));
        nw = Math.max(MIN_RECT, Math.min(maxX - x.value, w.value + e.changeX));
        nh = h.value - (ny - y.value);
      } else if (corner === "bl") {
        nx = Math.max(minX, Math.min(x.value + w.value - MIN_RECT, x.value + e.changeX));
        nw = w.value - (nx - x.value);
        nh = Math.max(MIN_RECT, Math.min(maxY - y.value, h.value + e.changeY));
      } else {
        nw = Math.max(MIN_RECT, Math.min(maxX - x.value, w.value + e.changeX));
        nh = Math.max(MIN_RECT, Math.min(maxY - y.value, h.value + e.changeY));
      }
      x.value = nx;
      y.value = ny;
      w.value = nw;
      h.value = nh;
    });

  const rectStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  const dimTopStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    top: drawAreaY,
    right: 0,
    height: y.value - drawAreaY,
  }));
  const dimBottomStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    top: y.value + h.value,
    right: 0,
    bottom: footerH,
  }));
  const dimLeftStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: 0,
    top: y.value,
    width: x.value,
    height: h.value,
  }));
  const dimRightStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value + w.value,
    top: y.value,
    right: 0,
    height: h.value,
  }));

  const tlStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value - HANDLE_SIZE / 2,
    top: y.value - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }));
  const trStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value + w.value - HANDLE_SIZE / 2,
    top: y.value - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }));
  const blStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value - HANDLE_SIZE / 2,
    top: y.value + h.value - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }));
  const brStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: x.value + w.value - HANDLE_SIZE / 2,
    top: y.value + h.value - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }));

  const runScan = useCallback(
    async (cropX: number, cropY: number, cropW: number, cropH: number) => {
      setBusy(true);
      const createdAt = Date.now();
      try {
        // Map screen-space rect → image-space rect.
        const sx = (cropX - fit.x) / fit.w;
        const sy = (cropY - fit.y) / fit.h;
        const sw = cropW / fit.w;
        const sh = cropH / fit.h;
        const result = await manipulateAsync(
          uri,
          [
            {
              crop: {
                originX: Math.max(0, Math.round(sx * imgW)),
                originY: Math.max(0, Math.round(sy * imgH)),
                width: Math.max(1, Math.round(sw * imgW)),
                height: Math.max(1, Math.round(sh * imgH)),
              },
            },
          ],
          { compress: 0.9, format: SaveFormat.JPEG },
        );
        const { rawText, text } = await recogniseText(result.uri);
        const parsed = parseIngredients(text);
        if (parsed.length < 3) {
          Alert.alert(
            "Couldn't read that",
            "Only a few words came through. Try a tighter crop, better lighting, or a closer photo.",
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
            // eslint-disable-next-line no-console
            console.warn("saveScan failed:", err);
          }
        }
        setCurrentScan({
          id: scanId,
          createdAt,
          ocrText: rawText,
          parsedIngredients: parsed,
          matches,
        });
        navigation.navigate("Results", scanId ? { scanId } : undefined);
      } catch (err) {
        Alert.alert("Scan failed", (err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [fit, imgH, imgW, navigation, setCurrentScan, uri],
  );

  const onConfirm = useCallback(() => {
    if (busy) return;
    // Snapshot the rect from the worklet onto JS thread before kicking
    // off the async manipulate / OCR work.
    const snap = { x: x.value, y: y.value, w: w.value, h: h.value };
    void runScan(snap.x, snap.y, snap.w, snap.h);
  }, [busy, h, runScan, w, x, y]);

  // Single tap inside body should also count as a "no movement" pan.
  const onTapMove = useCallback(
    (px: number, py: number) => {
      "worklet";
      const halfW = w.value / 2;
      const halfH = h.value / 2;
      x.value = Math.max(minX, Math.min(maxX - w.value, px - halfW));
      y.value = Math.max(minY, Math.min(maxY - h.value, py - halfH));
    },
    [h, maxX, maxY, minX, minY, w, x, y],
  );

  const tap = Gesture.Tap().onEnd((e) => {
    "worklet";
    runOnJS(onTapMove)(e.absoluteX, e.absoluteY);
  });

  return (
    <View style={styles.container}>
      <Image
        source={{ uri }}
        style={[
          styles.photo,
          { top: drawAreaY, height: drawAreaH },
        ]}
        resizeMode="contain"
      />
      <Animated.View style={[styles.dim, dimTopStyle]} pointerEvents="none" />
      <Animated.View style={[styles.dim, dimBottomStyle]} pointerEvents="none" />
      <Animated.View style={[styles.dim, dimLeftStyle]} pointerEvents="none" />
      <Animated.View style={[styles.dim, dimRightStyle]} pointerEvents="none" />

      <GestureDetector gesture={Gesture.Simultaneous(bodyPan, tap)}>
        <Animated.View style={[styles.rect, rectStyle]} />
      </GestureDetector>

      <GestureDetector gesture={cornerPan("tl")}>
        <Animated.View style={[styles.handle, tlStyle]} />
      </GestureDetector>
      <GestureDetector gesture={cornerPan("tr")}>
        <Animated.View style={[styles.handle, trStyle]} />
      </GestureDetector>
      <GestureDetector gesture={cornerPan("bl")}>
        <Animated.View style={[styles.handle, blStyle]} />
      </GestureDetector>
      <GestureDetector gesture={cornerPan("br")}>
        <Animated.View style={[styles.handle, brStyle]} />
      </GestureDetector>

      <View style={[styles.header, { height: headerH }]}>
        <Text style={styles.headerText}>Drag the box around the ingredients</Text>
      </View>

      <View style={[styles.footer, { height: footerH }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.btn, styles.btnSecondary]}
          disabled={busy}
        >
          <Text style={styles.btnSecondaryText}>Retake</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.btnPrimaryText}>Read this region</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  photo: { position: "absolute", left: 0, right: 0 },
  dim: { backgroundColor: "rgba(0,0,0,0.55)" },
  rect: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: "transparent",
  },
  handle: {
    backgroundColor: colors.accent,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 3,
    borderColor: "#fff",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing(10),
    paddingHorizontal: spacing(4),
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(6),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: spacing(3),
  },
  btn: {
    flex: 1,
    paddingVertical: spacing(3),
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#fff",
  },
  btnSecondaryText: { color: "#fff", fontWeight: "600" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.accentText, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
});
