import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Match } from "@/types";
import { colors, radii, spacing } from "@/theme/colors";
import { EvidenceTierBadge } from "./EvidenceTierBadge";

interface Props {
  match: Match;
  onPress?: () => void;
}

const MATCH_TYPE_LABEL = {
  exact: "Exact match",
  fuzzy: "Likely match (OCR-corrected)",
  cas: "Matched by CAS number",
} as const;

export function SubstanceMatchCard({ match, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.canonical} numberOfLines={2}>
          {match.substance.canonicalName}
        </Text>
        <EvidenceTierBadge tier={match.substance.evidenceTier} />
      </View>
      <Text style={styles.matchedIngredient} numberOfLines={1}>
        Matched “{match.matchedIngredient.trim()}”
      </Text>
      <Text style={styles.meta}>
        {MATCH_TYPE_LABEL[match.matchType]} · confidence{" "}
        {Math.round(match.confidence * 100)}%
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    marginBottom: spacing(3),
  },
  pressed: { opacity: 0.7 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing(2),
    marginBottom: spacing(2),
  },
  canonical: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  matchedIngredient: {
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing(1),
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
