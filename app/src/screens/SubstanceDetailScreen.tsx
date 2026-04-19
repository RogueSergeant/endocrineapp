import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { SUBSTANCES } from "../lib/matching/substances";
import { EvidenceTierBadge } from "../components/EvidenceTierBadge";
import { TIER_EXPLAINER } from "../lib/utils/evidenceTier";

type Props = NativeStackScreenProps<RootStackParamList, "SubstanceDetail">;

export function SubstanceDetailScreen({ route }: Props): React.ReactElement {
  const sub = SUBSTANCES[route.params.substanceId];

  if (!sub) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Substance not in this build</Text>
        <Text style={styles.emptyBody}>
          This scan was saved with an older substance database. Re-scan the product
          for the latest data.
        </Text>
      </View>
    );
  }

  const edListsUrl = sub.casNumber
    ? `https://edlists.org/search?cas=${encodeURIComponent(sub.casNumber)}`
    : "https://edlists.org";

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.name}>{sub.canonicalName}</Text>
      <EvidenceTierBadge tier={sub.evidenceTier} />

      <Text style={styles.explainer}>{TIER_EXPLAINER[sub.evidenceTier]}</Text>

      <Section title="Identifiers">
        {sub.casNumber ? <KV k="CAS" v={sub.casNumber} /> : null}
        {sub.ecNumber ? <KV k="EC" v={sub.ecNumber} /> : null}
        {sub.inciName ? <KV k="INCI" v={sub.inciName} /> : null}
      </Section>

      <Section title="Effects">
        <KV k="Health" v={sub.healthEffects ? "Flagged" : "Not flagged"} />
        <KV k="Environmental" v={sub.envEffects ? "Flagged" : "Not flagged"} />
      </Section>

      <Section title={`Assessments (${sub.assessments.length})`}>
        {sub.assessments.map((a, i) => (
          <View key={i} style={styles.assessment}>
            <Text style={styles.assessmentStatus}>
              List {a.listId} · {a.status}
            </Text>
            {a.regulatoryField ? (
              <Text style={styles.assessmentMeta}>{a.regulatoryField}</Text>
            ) : null}
            {a.year ? <Text style={styles.assessmentMeta}>{a.year}</Text> : null}
          </View>
        ))}
      </Section>

      <Section title={`Aliases (${sub.aliases.length})`}>
        <Text style={styles.aliasList}>{sub.aliases.join(", ")}</Text>
      </Section>

      <Text style={styles.link} onPress={() => Linking.openURL(edListsUrl)}>
        View on edlists.org →
      </Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 80, backgroundColor: "#F7FAFC" },
  name: { fontSize: 22, fontWeight: "700", color: "#1A202C", marginBottom: 10 },
  explainer: { marginTop: 12, fontSize: 14, color: "#2D3748", lineHeight: 20 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#718096", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  kv: { flexDirection: "row", paddingVertical: 4 },
  kvKey: { width: 110, color: "#4A5568", fontSize: 14 },
  kvVal: { flex: 1, color: "#1A202C", fontSize: 14 },
  assessment: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  assessmentStatus: { fontSize: 14, fontWeight: "600", color: "#1A202C" },
  assessmentMeta: { fontSize: 13, color: "#4A5568", marginTop: 2 },
  aliasList: { fontSize: 13, color: "#2D3748", lineHeight: 20 },
  link: { marginTop: 32, fontSize: 15, color: "#2B6CB0", fontWeight: "600" },
  empty: { flex: 1, padding: 24, justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptyBody: { marginTop: 8, fontSize: 14, color: "#4A5568" },
});
