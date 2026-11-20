import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Icon, IconName } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} color={String(color)} size={24} />,
});

/** The raised center button: opens the bill scanner instead of switching tab. */
function ScanTabButton() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        onPress={() => router.push({ pathname: '/scan', params: { source: 'camera' } })}
        accessibilityRole="button"
        accessibilityLabel="Scan a bill"
        style={({ pressed }) => ({
          width: 58, height: 58, borderRadius: 29, marginTop: -26,
          backgroundColor: pressed ? c.primaryPressed : c.primary,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 4, borderColor: c.surface,
          ...(Platform.OS === 'web'
            ? ({ boxShadow: '0 6px 14px rgba(79,70,229,0.35)' } as object)
            : { shadowColor: c.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 }),
        })}>
        <Icon name="scan" color={c.onPrimary} size={26} />
      </Pressable>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.primary, marginTop: 0 }}>Scan</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.text, fontWeight: '800' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ ...tab('Home', 'home'), headerShown: false }} />
      <Tabs.Screen name="bills" options={tab('My Bills', 'receipt')} />
      <Tabs.Screen name="scan-tab" options={{ title: 'Scan', tabBarButton: () => <ScanTabButton /> }} />
      <Tabs.Screen name="trips" options={tab('Trips', 'trip')} />
      <Tabs.Screen name="groups" options={tab('Groups', 'users')} />
    </Tabs>
  );
}
