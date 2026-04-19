import React from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { APP_VERSION } from "../lib/config";
import {
  SUBSTANCES_DB_VERSION,
  SUBSTANCES_SOURCE_UPDATED,
} from "../lib/matching/substances";
import { deleteAllScans } from "../lib/firebase/scans";
import { useHistoryStore } from "../lib/store/scanStore";

export function SettingsScreen(): React.ReactElement {
  const clearHistory = useHistoryStore((s) => s.clear);

  const onDeleteAll = () => {
    Alert.alert(
      "Delete all scans?",
      "This removes every scan from your history. It can’t be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            clearHistory();
            try {
              await deleteAllScans();
            } catch (err) {
              console.warn("[settings] delete-all failed", err);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Row k="App version" v={APP_VERSION} />
      <Row k="Substances DB" v={SUBSTANCES_DB_VERSION} />
      <Row k="Source last updated" v={SUBSTANCES_SOURCE_UPDATED} />

      <Text style={styles.sectionTitle}>Your data</Text>
      <Pressable style={styles.destructive} onPress={onDeleteAll}>
        <Text style={styles.destructiveText}>Delete all scan history</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Attribution</Text>
      <Text style={styles.body}>
        Substance data derived from edlists.org (Lists I, II, III), the EU CosIng
        database, and PubChem synonyms. This app is not affiliated with any of
        these sources.
      </Text>
      <Pressable onPress={() => Linking.openURL("https://edlists.org")}>
        <Text style={styles.link}>edlists.org →</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <Text style={styles.body}>
        Scans are stored under an anonymous per-device account in Firebase.
        Images, if cached, are deleted after 30 days. OCR runs on your device.
      </Text>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, backgroundColor: "#F7FAFC" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#CBD5E0" },
  rowKey: { color: "#4A5568", fontSize: 14 },
  rowVal: { color: "#1A202C", fontSize: 14, fontWeight: "600" },
  sectionTitle: { marginTop: 28, marginBottom: 10, fontSize: 13, fontWeight: "700", color: "#718096", textTransform: "uppercase", letterSpacing: 0.5 },
  destructive: { backgroundColor: "#FED7D7", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  destructiveText: { color: "#9B2C2C", fontSize: 15, fontWeight: "600" },
  body: { fontSize: 14, color: "#2D3748", lineHeight: 20 },
  link: { marginTop: 8, color: "#2B6CB0", fontSize: 14, fontWeight: "600" },
});
