import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ScanDoc } from "../types";

interface Props {
  scan: ScanDoc;
  onPress: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

export function ScanHistoryItem({ scan, onPress }: Props): React.ReactElement {
  const count = scan.matches.length;
  const preview = scan.matches[0]?.canonicalName ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.left}>
        <Text style={styles.date}>{formatDate(scan.createdAt)}</Text>
        <Text style={styles.count}>
          {count === 0 ? "No flagged substances" : `${count} flagged`}
        </Text>
        {preview ? <Text style={styles.preview} numberOfLines={1}>{preview}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  pressed: { opacity: 0.6 },
  left: { flex: 1 },
  date: { fontSize: 13, color: "#4A5568" },
  count: { fontSize: 16, fontWeight: "600", color: "#1A202C", marginTop: 2 },
  preview: { fontSize: 13, color: "#718096", marginTop: 2 },
  chevron: { fontSize: 22, color: "#A0AEC0", paddingHorizontal: 6 },
});
