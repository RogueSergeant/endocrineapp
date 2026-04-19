import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StoredMatch } from "../types";
import { EvidenceTierBadge } from "./EvidenceTierBadge";

interface Props {
  match: StoredMatch;
  onPress?: () => void;
}

export function SubstanceMatchCard({ match, onPress }: Props): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${match.canonicalName}, evidence tier ${match.evidenceTier}`}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={2}>
          {match.canonicalName}
        </Text>
        <EvidenceTierBadge tier={match.evidenceTier} compact />
      </View>
      <Text style={styles.meta}>
        Matched “{match.matchedIngredient}”
        {match.matchType !== "exact" ? ` · ${match.matchType}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1A202C",
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: "#4A5568",
  },
});
