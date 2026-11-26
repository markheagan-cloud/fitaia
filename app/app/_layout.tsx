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
import { Celebration } from '@/fx/Celebration';
import { startMusic } from '@/services/sound';
import { RewardBurst } from '@/fx/RewardBurst';
import { CoachSheet } from '@/components/CoachSheet';
import { useGame } from '@/store/useGame';
import { caricatureConfigured } from '@/services/caricature';
import { COMMUNITY_MINOR_MESSAGE, canJoinCommunity } from '@/community/access';
import { startCommunitySync, useCommunity } from '@/community/store';
import { PortraitSharer } from '@/community/components/PortraitSharer';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const t = useTheme();
  const onboarded = useGame((s) => s.onboarded);
  const age = useGame((s) => s.profile.age);
  const pathname = usePathname();
  // le perso de FITAIA est celui de la personne : sans selfie, on ne va pas plus loin que l'écran du selfie
  const needsSelfie = useGame((s) => s.hydrated && s.onboarded && caricatureConfigured && !s.selfieUri && !s.caricature);
  // Garde des routes : Communauté réservée aux majeurs (liens profonds compris), labo 3D réservé au développement.
  const minorInCommunity = pathname.startsWith('/communaute') && !canJoinCommunity(age);
  const devOnly = !__DEV__ && pathname.startsWith('/human-engine-debug');
  useEffect(() => {
    if (minorInCommunity) useGame.getState().say(COMMUNITY_MINOR_MESSAGE, 'bad');
  }, [minorInCommunity]);
  // Communauté en ligne : rafraîchissement régulier (plus rapide dans une discussion) et refus du serveur affichés
  const pathRef = React.useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => startCommunitySync(() => pathRef.current.startsWith('/communaute/discussion') || pathRef.current.startsWith('/communaute/forum/')), []);
  const serverError = useCommunity((s) => s.serverError);
  useEffect(() => {
    if (!serverError) return;
    useGame.getState().say(serverError, 'bad');
    useCommunity.getState().clearServerError();
  }, [serverError]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useGame.getState().rollover();
    });
    // l'app peut rester ouverte au passage de minuit : on vérifie le jour chaque minute (rollover ne fait rien le même jour)
    startMusic();
    const tick = setInterval(() => useGame.getState().rollover(), 60_000);
    return () => {
      clearInterval(tick);
      sub.remove();
      useGame.getState().stopTimers();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <PortraitSharer />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="selfie" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="reveal" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="creator" options={{ animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="human-engine-debug" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
        <Stack.Screen name="corps" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="communaute/index" />
        <Stack.Screen name="communaute/fitmatch" />
        <Stack.Screen name="communaute/messages" />
        <Stack.Screen name="communaute/confidentialite" />
        <Stack.Screen name="communaute/coup-de-pouce" />
        <Stack.Screen name="communaute/profil/[id]" />
        <Stack.Screen name="communaute/discussion/[id]" />
        <Stack.Screen name="communaute/forums" />
        <Stack.Screen name="communaute/forum/[id]" />
      </Stack>
      {!onboarded && pathname !== '/onboarding' ? <Redirect href="/onboarding" /> : null}
      {needsSelfie && pathname !== '/selfie' && pathname !== '/onboarding' ? <Redirect href="/selfie" /> : null}
      {onboarded && !needsSelfie && (minorInCommunity || devOnly) ? <Redirect href="/(tabs)" /> : null}
      <Toast />
      <CoachSheet />
      <RewardBurst />
      <Celebration />
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
