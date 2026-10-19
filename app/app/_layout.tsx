import React, { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { Stack, Redirect, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { Toast } from '@/components/Toast';
import { RewardBurst } from '@/fx/RewardBurst';
import { CoachSheet } from '@/components/CoachSheet';
import { useGame } from '@/store/useGame';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const t = useTheme();
  const onboarded = useGame((s) => s.onboarded);
  const pathname = usePathname();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useGame.getState().rollover();
    });
    return () => {
      sub.remove();
      useGame.getState().stopTimers();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="selfie" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="creator" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="paywall" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="human-engine-debug" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="corps" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="communaute/index" />
        <Stack.Screen name="communaute/fitmatch" />
        <Stack.Screen name="communaute/messages" />
        <Stack.Screen name="communaute/confidentialite" />
        <Stack.Screen name="communaute/coup-de-pouce" />
        <Stack.Screen name="communaute/profil/[id]" />
        <Stack.Screen name="communaute/discussion/[id]" />
      </Stack>
      {!onboarded && pathname !== '/onboarding' ? <Redirect href="/onboarding" /> : null}
      <Toast />
      <CoachSheet />
      <RewardBurst />
    </View>
  );
}

export default function Layout() {
  const [loaded, error] = useFonts({
    ArchivoSemiExpanded_800ExtraBold: require('../assets/fonts/ArchivoSemiExpanded-ExtraBold.ttf'),
    ArchivoExpanded_800ExtraBold: require('../assets/fonts/ArchivoExpanded-ExtraBold.ttf'),
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  const hydrated = useGame((s) => s.hydrated);
  if ((!loaded && !error) || !hydrated) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
