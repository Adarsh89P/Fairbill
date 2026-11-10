import { Tabs } from 'expo-router/tabs';
import React from 'react';
import { Icon, IconName } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: unknown }) => <Icon name={icon} color={String(color)} size={24} />,
});

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.text, fontWeight: '800' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ ...tab('Home', 'home'), headerShown: false }} />
      <Tabs.Screen name="bills" options={tab('My Bills', 'receipt')} />
      <Tabs.Screen name="groups" options={tab('Groups', 'users')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'user')} />
    </Tabs>
  );
}
