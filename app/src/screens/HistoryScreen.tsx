import { useCallback } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { ScanDoc } from "@/types";
import type { RootStackParamList } from "@/navigation/types";
import { ScanHistoryItem } from "@/components/ScanHistoryItem";
import { deleteScan, listScans } from "@/lib/firebase/scans";
import { colors, spacing } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

export function HistoryScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const query = useQuery<ScanDoc[]>({
    queryKey: ["scans"],
    queryFn: () => listScans(),
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
    }, [queryClient]),
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteScan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scans"] }),
    onError: (err) =>
      Alert.alert("Couldn't delete", (err as Error).message ?? "Unknown error"),
  });

  const onDelete = (scan: ScanDoc) => {
    Alert.alert("Delete this scan?", scan.id, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(scan.id),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
          />
        }
        ListEmptyComponent={
          query.isLoading ? null : (
            <Text style={styles.empty}>
              No scans yet. Tap the camera to capture one.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View>
            <ScanHistoryItem
              scan={item}
              onPress={() =>
                navigation.navigate("Results", { readOnlyScan: item })
              }
            />
            <Pressable onPress={() => onDelete(item)} style={styles.deleteRow}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  empty: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing(10),
  },
  deleteRow: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    marginBottom: spacing(3),
    marginTop: -spacing(2),
  },
  deleteText: {
    color: colors.tier1.fg,
    fontSize: 12,
    fontWeight: "600",
  },
});
