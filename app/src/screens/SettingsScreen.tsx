import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { deleteAllScans } from "@/lib/firebase/scans";
import { substanceDb } from "@/lib/store/scanStore";
import { colors, radii, spacing } from "@/theme/colors";

export function SettingsScreen() {
  const queryClient = useQueryClient();

  const handleDeleteAll = () => {
    Alert.alert(
      "Delete all scans?",
      "This permanently removes your scan history from this account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAllScans();
              await queryClient.invalidateQueries({ queryKey: ["scans"] });
              Alert.alert("Done", "All scans deleted.");
            } catch (err) {
              Alert.alert("Failed", (err as Error).message);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section label="App">
        <Row k="Version" v={String(Constants.expoConfig?.version ?? "0.1.0")} />
        <Row k="Substance DB" v={substanceDb.version} />
        <Row k="Source updated" v={substanceDb.sourceLastUpdated} />
        <Row k="Substances tracked" v={String(substanceDb.substanceCount)} />
      </Section>

      <Section label="Data">
        <Pressable onPress={handleDeleteAll} style={styles.dangerBtn}>
          <Text style={styles.dangerText}>Delete all my scan history</Text>
        </Pressable>
      </Section>

      <Section label="Attribution">
        <Text style={styles.body}>
          Substance lists from edlists.org (Lists I, II, III). INCI mapping from
          the EU CosIng database. Synonym enrichment from PubChem.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL("https://edlists.org")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkBtnText}>Visit edlists.org</Text>
        </Pressable>
      </Section>

      <Section label="Privacy">
        <Text style={styles.body}>
          Your scans are stored under an anonymous Firebase account tied to this
          install. Photos are processed on-device — they never leave your phone.
          This app is not medical advice.
        </Text>
      </Section>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing(1),
  },
  rowKey: { color: colors.textMuted, fontSize: 14 },
  rowVal: { color: colors.text, fontSize: 14, fontWeight: "500" },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dangerBtn: {
    backgroundColor: colors.tier1.bg,
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.tier1.border,
  },
  dangerText: { color: colors.tier1.fg, fontWeight: "600" },
  linkBtn: {
    marginTop: spacing(3),
    backgroundColor: colors.accent,
    paddingVertical: spacing(3),
    alignItems: "center",
    borderRadius: radii.md,
  },
  linkBtnText: { color: colors.accentText, fontWeight: "600" },
});
