import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/types";
import type { Match } from "@/types";
import { SubstanceMatchCard } from "@/components/SubstanceMatchCard";
import { substanceDb, useScanStore, getSubstanceById } from "@/lib/store/scanStore";
import { colors, radii, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Results">;

export function ResultsScreen({ navigation, route }: Props) {
  const current = useScanStore((s) => s.current);
  const readOnlyScan = route.params?.readOnlyScan;
  const [showIngredients, setShowIngredients] = useState(false);

  const view = useMemo(() => {
    if (readOnlyScan) {
      const matches: Match[] = readOnlyScan.matches
        .map((m) => {
          const substance = getSubstanceById(m.substanceId);
          if (!substance) return null;
          return {
            substance,
            matchedAlias: m.matchedAlias,
            matchedIngredient: m.matchedIngredient,
            ingredientPosition: m.ingredientPosition,
            matchType: m.matchType,
            confidence: m.confidence,
          } satisfies Match;
        })
        .filter((m): m is Match => m !== null);
      return {
        parsedIngredients: readOnlyScan.parsedIngredients,
        matches,
        savedAt: readOnlyScan.createdAt,
      };
    }
    if (current) {
      return {
        parsedIngredients: current.parsedIngredients,
        matches: current.matches,
        savedAt: current.createdAt,
      };
    }
    return null;
  }, [current, readOnlyScan]);

  if (!view) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No scan loaded yet.</Text>
        <Pressable
          onPress={() => navigation.navigate("Scan")}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Open scanner</Text>
        </Pressable>
      </View>
    );
  }

  const flagged = view.matches.length;
  const summary =
    flagged === 0
      ? "No flagged substances found"
      : `${flagged} flagged substance${flagged === 1 ? "" : "s"} found`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.summary}>{summary}</Text>
      {flagged === 0 ? (
        <Text style={styles.disclaimer}>
          None of the {substanceDb.substanceCount} substances we track were
          detected in this list. This does not mean the product is safe.
        </Text>
      ) : (
        view.matches.map((m) => (
          <SubstanceMatchCard
            key={m.substance.id}
            match={m}
            onPress={() =>
              navigation.navigate("SubstanceDetail", { substanceId: m.substance.id })
            }
          />
        ))
      )}

      <Pressable
        onPress={() => setShowIngredients((v) => !v)}
        style={styles.collapseToggle}
      >
        <Text style={styles.collapseText}>
          {showIngredients ? "Hide" : "Show"} ingredients we read (
          {view.parsedIngredients.length})
        </Text>
      </Pressable>
      {showIngredients && (
        <View style={styles.ingredientsBox}>
          {view.parsedIngredients.map((ing, i) => (
            <Text key={`${ing}-${i}`} style={styles.ingredientLine}>
              {i + 1}. {ing}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        Source: edlists.org, {substanceDb.sourceLastUpdated}. Not medical advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  empty: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing(6),
  },
  emptyText: { color: colors.textMuted, marginBottom: spacing(4) },
  cta: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
    borderRadius: radii.md,
  },
  ctaText: { color: colors.accentText, fontWeight: "600" },
  summary: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing(2),
  },
  disclaimer: {
    color: colors.textMuted,
    marginBottom: spacing(4),
    lineHeight: 20,
  },
  collapseToggle: {
    paddingVertical: spacing(3),
    marginTop: spacing(2),
  },
  collapseText: { color: colors.accent, fontWeight: "600" },
  ingredientsBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  ingredientLine: {
    fontSize: 13,
    color: colors.text,
    paddingVertical: 2,
  },
  footer: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing(6),
  },
});
