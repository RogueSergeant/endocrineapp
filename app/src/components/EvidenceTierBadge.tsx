import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EvidenceTier } from "../types";
import { TIER_BG, TIER_COLOR, TIER_LABEL } from "../lib/utils/evidenceTier";

interface Props {
  tier: EvidenceTier;
  compact?: boolean;
}

export function EvidenceTierBadge({ tier, compact = false }: Props): React.ReactElement {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: TIER_BG[tier] },
        compact && styles.compact,
      ]}
      accessibilityLabel={`Evidence tier ${tier}: ${TIER_LABEL[tier]}`}
    >
      <Text style={[styles.label, { color: TIER_COLOR[tier] }]}>
        {compact ? `T${tier}` : TIER_LABEL[tier]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  compact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
