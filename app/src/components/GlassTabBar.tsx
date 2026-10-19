import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { Press } from './Press';
import { Txt } from './Txt';
import { HomeIcon, PulseIcon, ScanIcon, ShopIcon, PersoIcon } from './Icons';

/** Props structurelles : compatibles avec le tabBar d'expo-router ET de @react-navigation (types divergents). */
export type GlassTabBarProps = {
  state: TabNavigationState<ParamListBase>;
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { navigate: (name: string) => void };
};

export const NAV_H = 70;
export const NAV_BOTTOM = 22;

const ICONS: Record<string, (p: { color: string }) => React.ReactElement> = {
  index: ({ color }) => <HomeIcon color={color} />,
  defis: ({ color }) => <PulseIcon color={color} />,
  boutique: ({ color }) => <ShopIcon color={color} />,
  perso: ({ color }) => <PersoIcon color={color} />,
};

/**
 * <nav> flottante de la maquette : verre dépoli, 4 onglets + bouton Scanner central.
 * Blur natif iOS ; Android ≥ 12 via expo-blur (dimezis) ; sinon fond opaque.
 */
export function GlassTabBar({ state, descriptors, navigation }: GlassTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const resetScan = useGame((s) => s.resetScan);
  const canBlur = Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 31);

  const bottom = Math.max(NAV_BOTTOM, insets.bottom + 6);
  const inner = (
    <View style={styles.row}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key]?.options.title ?? route.name;
        if (route.name === 'scanner') {
          return (
            <Press
              key={route.key}
              accessibilityLabel="Scanner un repas"
              haptic="medium"
              onPress={() => {
                resetScan();
                navigation.navigate(route.name);
              }}
              style={[styles.scan, shadow.btn]}
            >
              <ScanIcon size={26} color={LIME} />
            </Press>
          );
        }
        const color = focused ? t.ink : t.ink2;
        const Icon = ICONS[route.name];
        return (
          <Press
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            haptic="none"
            pressScale={0.92}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tab}
          >
            {Icon ? <Icon color={color} /> : null}
            <Txt size={11} weight={focused ? 'bold' : 'medium'} color={color}>{label}</Txt>
          </Press>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.wrap, { bottom }]}>
      <View style={[styles.bar, { borderColor: t.glassEdge, backgroundColor: canBlur ? 'transparent' : t.surf }, shadow.nav]}>
        {canBlur ? (
          <BlurView
            intensity={60}
            tint={t.dark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={[StyleSheet.absoluteFill, { backgroundColor: t.glass }]}
          />
        ) : null}
        {inner}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, pointerEvents: 'box-none' },
  bar: { height: NAV_H, borderRadius: 30, overflow: 'hidden', borderWidth: 1 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  tab: { minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  scan: { width: 58, height: 58, borderRadius: 22, backgroundColor: OBSIDIAN, alignItems: 'center', justifyContent: 'center' },
});
