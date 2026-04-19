import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { SubstanceMatchCard } from "../components/SubstanceMatchCard";
import { useScanStore } from "../lib/store/scanStore";
import { SUBSTANCES_SOURCE_UPDATED } from "../lib/matching/substances";
import { denormaliseMatches } from "../lib/firebase/scans";
import type { StoredMatch } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Results">;

export function ResultsScreen({ route, navigation }: Props): React.ReactElement {
  const fromStore = useScanStore();
  const scan = route.params?.scan;

  const parsed: string[] = scan?.parsedIngredients ?? fromStore.lastParsed;
  const matches: StoredMatch[] = useMemo(() => {
    if (scan) return scan.matches;
    return denormaliseMatches(fromStore.lastMatches);
  }, [scan, fromStore.lastMatches]);

  const [showIngredients, setShowIngredients] = useState(false);
  const flaggedCount = matches.length;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>
        {flaggedCount === 0
          ? "No flagged substances found"
          : `${flaggedCount} flagged substance${flaggedCount === 1 ? "" : "s"}`}
      </Text>
      <Text style={styles.sub}>
        {flaggedCount === 0
          ? "None of the substances we track were detected. This doesn’t mean the product is safe — only that nothing on the edlists.org lists was found."
          : "Tap any item for the source detail and evidence."}
      </Text>

      <View style={styles.list}>
        {matches.map((m) => (
          <SubstanceMatchCard
            key={`${m.substanceId}-${m.ingredientPosition}`}
            match={m}
            onPress={() =>
              navigation.navigate("SubstanceDetail", { substanceId: m.substanceId })
            }
          />
        ))}
      </View>

      <TouchableOpacity
        onPress={() => setShowIngredients((v) => !v)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {showIngredients ? "▾ " : "▸ "}Ingredients we read ({parsed.length})
        </Text>
      </TouchableOpacity>

      {showIngredients ? (
        <View style={styles.ingredientsBox}>
          {parsed.map((ing, i) => (
            <Text key={`${i}-${ing}`} style={styles.ingredientLine}>
              {i + 1}. {ing}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.footer}>
        Source: edlists.org, {SUBSTANCES_SOURCE_UPDATED}. Not medical advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60, backgroundColor: "#F7FAFC" },
  title: { fontSize: 22, fontWeight: "700", color: "#1A202C", marginBottom: 6 },
  sub: { fontSize: 14, color: "#4A5568", marginBottom: 16, lineHeight: 20 },
  list: { marginTop: 4 },
  toggle: { marginTop: 20, paddingVertical: 10 },
  toggleText: { fontSize: 15, fontWeight: "600", color: "#2B6CB0" },
  ingredientsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  ingredientLine: { fontSize: 13, color: "#2D3748", lineHeight: 20 },
  footer: {
    marginTop: 30,
    fontSize: 12,
    color: "#718096",
    textAlign: "center",
    lineHeight: 18,
  },
});
