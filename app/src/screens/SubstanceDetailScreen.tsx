import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ListId } from "@/types";
import type { RootStackParamList } from "@/navigation/types";
import { EvidenceTierBadge } from "@/components/EvidenceTierBadge";
import { getSubstanceById } from "@/lib/store/scanStore";
import { colors, radii, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "SubstanceDetail">;

const TIER_EXPLANATION: Record<ListId, string> = {
  1: "Legally identified as an endocrine disruptor at EU level.",
  2: "Currently under investigation by an EU regulatory process.",
  3: "Evaluated as endocrine-disrupting by a single national authority.",
};

export function SubstanceDetailScreen({ route }: Props) {
  const substance = getSubstanceById(route.params.substanceId);
  if (!substance) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Substance not found.</Text>
      </View>
    );
  }
  const edlistsUrl = `https://edlists.org/the-ed-lists${substance.casNumber ? `?q=${encodeURIComponent(substance.casNumber)}` : ""}`;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{substance.canonicalName}</Text>
      <View style={styles.row}>
        <EvidenceTierBadge tier={substance.evidenceTier} />
      </View>
      <Text style={styles.tierExplanation}>
        {TIER_EXPLANATION[substance.evidenceTier]}
      </Text>

      <Section label="Identifiers">
        {substance.casNumber && (
          <Text style={styles.kv}>CAS: {substance.casNumber}</Text>
        )}
        {substance.ecNumber && (
          <Text style={styles.kv}>EC: {substance.ecNumber}</Text>
        )}
        {substance.inciName && (
          <Text style={styles.kv}>INCI: {substance.inciName}</Text>
        )}
      </Section>

      <Section label="Aliases">
        <Text style={styles.body}>
          {substance.aliases.length > 0 ? substance.aliases.join(", ") : "—"}
        </Text>
      </Section>

      <Section label="Effects">
        <Text style={styles.body}>
          {substance.healthEffects ? "• Health effects flagged" : "• No health flag"}
          {"\n"}
          {substance.envEffects
            ? "• Environmental effects flagged"
            : "• No environmental flag"}
        </Text>
      </Section>

      <Section label="Assessments">
        {substance.assessments.length === 0 ? (
          <Text style={styles.body}>No assessment metadata.</Text>
        ) : (
          substance.assessments.map((a, i) => (
            <View key={i} style={styles.assessment}>
              <Text style={styles.kv}>
                List {a.listId} · {a.status}
              </Text>
              <Text style={styles.kvMuted}>
                {[a.regulatoryField, a.year ? String(a.year) : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Pressable
        onPress={() => void Linking.openURL(edlistsUrl)}
        style={styles.linkBtn}
      >
        <Text style={styles.linkBtnText}>Open on edlists.org</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  emptyText: { color: colors.textMuted },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing(2),
  },
  row: { flexDirection: "row", marginBottom: spacing(2) },
  tierExplanation: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing(4),
    lineHeight: 20,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing(2),
    letterSpacing: 0.5,
  },
  kv: { fontSize: 14, color: colors.text, paddingVertical: 1 },
  kvMuted: { fontSize: 12, color: colors.textMuted, paddingVertical: 1 },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  assessment: { marginBottom: spacing(2) },
  linkBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing(3),
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: spacing(2),
  },
  linkBtnText: { color: colors.accentText, fontWeight: "600" },
});
