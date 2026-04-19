import { StyleSheet, Text, View } from "react-native";
import type { ListId } from "@/types";
import { colors, radii } from "@/theme/colors";

const LABELS: Record<ListId, string> = {
  1: "EU identified",
  2: "Under EU investigation",
  3: "National evaluation",
};

export function EvidenceTierBadge({ tier }: { tier: ListId }) {
  const palette =
    tier === 1 ? colors.tier1 : tier === 2 ? colors.tier2 : colors.tier3;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.label, { color: palette.fg }]}>{LABELS[tier]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
