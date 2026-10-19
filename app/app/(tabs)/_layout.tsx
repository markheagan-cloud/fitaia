import React from 'react';
import { Tabs } from 'expo-router';
import { GlassTabBar } from '@/components/GlassTabBar';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(p) => <GlassTabBar {...p} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg }, lazy: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="defis" options={{ title: 'Défis' }} />
      <Tabs.Screen name="scanner" options={{ title: 'Scanner' }} />
      <Tabs.Screen name="boutique" options={{ title: 'Boutique' }} />
      <Tabs.Screen name="perso" options={{ title: 'Mon perso' }} />
    </Tabs>
  );
}
