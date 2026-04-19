import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RootStackParamList } from "@/navigation/types";
import { ScanScreen } from "@/screens/ScanScreen";
import { CropScreen } from "@/screens/CropScreen";
import { ResultsScreen } from "@/screens/ResultsScreen";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { SubstanceDetailScreen } from "@/screens/SubstanceDetailScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { configureFirebase } from "@/lib/firebase/client";
import { ensureAnonymousAuth } from "@/lib/firebase/auth";
import { colors } from "@/theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
});

export default function App() {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    configureFirebase();
    ensureAnonymousAuth()
      .then(() => !cancelled && setReady(true))
      .catch((err: unknown) => {
        if (cancelled) return;
        setAuthError((err as Error).message);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          {authError && (
            <View style={styles.authBanner}>
              <Text style={styles.authBannerText}>
                {`Couldn't sign in: ${authError}. Scans won't sync.`}
              </Text>
            </View>
          )}
          <NavigationContainer>
            <Stack.Navigator initialRouteName="Scan">
              <Stack.Screen
                name="Scan"
                component={ScanScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Crop"
                component={CropScreen}
                options={{ headerShown: false, animation: "fade" }}
              />
              <Stack.Screen
                name="Results"
                component={ResultsScreen}
                options={{ title: "Results" }}
              />
              <Stack.Screen
                name="History"
                component={HistoryScreen}
                options={{ title: "Scan history" }}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  authBanner: {
    backgroundColor: colors.tier2.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authBannerText: { color: colors.tier2.fg, fontSize: 12 },
});
