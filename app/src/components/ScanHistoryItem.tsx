import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ScanDoc } from "@/types";
import { colors, radii, spacing } from "@/theme/colors";

interface Props {
  scan: ScanDoc;
  onPress?: () => void;
}

export function ScanHistoryItem({ scan, onPress }: Props) {
  const date = new Date(scan.createdAt);
  const matchCount = scan.matches.length;
  const firstMatch = scan.matches[0]?.canonicalName;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <Text style={styles.date}>{date.toLocaleString()}</Text>
      <Text style={styles.summary}>
        {matchCount === 0
          ? "No flagged substances"
          : `${matchCount} flagged · ${firstMatch ?? ""}`}
      </Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          {scan.parsedIngredients.length} ingredients read
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    backgroundColor: colors.surface,
    padding: spacing(4),
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(2),
  },
  pressed: { opacity: 0.7 },
  date: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing(1),
  },
  summary: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  meta: { marginTop: spacing(1) },
  metaText: { fontSize: 12, color: colors.textMuted },
});
