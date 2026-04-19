import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { ScanHistoryItem } from "../components/ScanHistoryItem";
import { deleteScan, listScans } from "../lib/firebase/scans";
import { useHistoryStore } from "../lib/store/scanStore";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

export function HistoryScreen({ navigation }: Props): React.ReactElement {
  const history = useHistoryStore((s) => s.history);
  const setHistory = useHistoryStore((s) => s.setHistory);
  const hydrated = useHistoryStore((s) => s.hydrated);
  const removeFromStore = useHistoryStore((s) => s.remove);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const scans = await listScans(100);
      setHistory(scans);
    } catch (err) {
      console.warn("[history] fetch failed", err);
    } finally {
      setRefreshing(false);
    }
  }, [setHistory]);

  useEffect(() => {
    if (!hydrated) {
      void refresh();
    }
  }, [hydrated, refresh]);

  const onDelete = (id: string) => {
    Alert.alert("Delete scan?", "This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          removeFromStore(id);
          try {
            await deleteScan(id);
          } catch (err) {
            console.warn("[history] delete failed", err);
          }
        },
      },
    ]);
  };

  if (!hydrated && refreshing) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No scans yet</Text>
        <Text style={styles.emptyBody}>
          Scan a product label and it will show up here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={history}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      renderItem={({ item }) => (
        <View>
          <ScanHistoryItem
            scan={item}
            onPress={() =>
              navigation.navigate("Results", { scanId: item.id, scan: item, fromHistory: true })
            }
          />
          <Pressable onPress={() => onDelete(item.id)} style={styles.deleteRow}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F7FAFC",
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#1A202C", marginBottom: 6 },
  emptyBody: { fontSize: 14, color: "#4A5568", textAlign: "center" },
  deleteRow: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  deleteText: { color: "#C53030", fontSize: 13 },
});
