import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RootStackParamList } from "./navigation/types";
import { ScanScreen } from "./screens/ScanScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { SubstanceDetailScreen } from "./screens/SubstanceDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ensureAnonymousUser } from "./lib/firebase/auth";

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

export default function App(): React.ReactElement {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureAnonymousUser();
      } catch (err) {
        console.warn("[app] anonymous sign-in failed (will retry on write)", err);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Scan">
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Results"
              component={ResultsScreen}
              options={{ title: "Results" }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ title: "History" }}
            />
            <Stack.Screen
              name="SubstanceDetail"
              component={SubstanceDetailScreen}
              options={{ title: "Substance" }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: "Settings" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
