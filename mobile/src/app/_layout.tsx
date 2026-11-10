import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../components/DialogHost';
import { AppStoreProvider, useStore } from '../store/AppStore';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

function Navigator() {
  const { ready } = useStore();
  const { c, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  return (
    <NavThemeProvider value={{ ...base, colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.surface, text: c.text, border: c.border } }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.primary,
          headerTitleStyle: { color: c.text, fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'Scan bill', presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="bill/[id]/review" options={{ title: 'Review bill' }} />
        <Stack.Screen name="bill/[id]/item" options={{ title: 'Item', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/charge" options={{ title: 'Tax or charge', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/people" options={{ title: 'Who was there?' }} />
        <Stack.Screen name="bill/[id]/assign" options={{ title: 'Who had what?' }} />
        <Stack.Screen name="bill/[id]/charges" options={{ title: 'Taxes & charges' }} />
        <Stack.Screen name="bill/[id]/summary" options={{ title: 'Summary' }} />
        <Stack.Screen name="bill/[id]/bulk" options={{ title: 'Share several items', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/picks" options={{ title: 'Friends pick their items', presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="trip/add" options={{ title: 'Add bills to trip', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/contacts" options={{ title: 'Add from contacts', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/image" options={{ title: 'Share bill image', presentation: 'modal' }} />
        <Stack.Screen name="bill/[id]/share" options={{ title: 'Share with friends', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Group', presentation: 'modal' }} />
        <Stack.Screen name="stats" options={{ title: 'Monthly spending' }} />
        <Stack.Screen name="account" options={{ title: 'Account', presentation: 'modal' }} />
      </Stack>
      <DialogHost />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStoreProvider>
        <ThemeProvider>
          <Navigator />
        </ThemeProvider>
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}
