import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from './Press';
import { Txt } from './Txt';

/**
 * Lecture de code-barres (EAN-13/8, UPC) par la caméra — fonctionne dans Expo Go.
 * Sur ordinateur (web), saisie du code à la main pour tester.
 */
export function BarcodeScanner({ onCode, onCancel, busy }: { onCode: (code: string) => void; onCancel: () => void; busy: boolean }) {
  const t = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const last = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const web = Platform.OS === 'web';

  useEffect(() => {
    if (!web && perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm, web]);

  const handle = (code: string) => {
    const now = Date.now();
    if (busy || (last.current.code === code && now - last.current.ts < 4000)) return;
    last.current = { code, ts: now };
    onCode(code);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.cam, shadow.md]}>
        {!web && perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={busy ? undefined : (r) => handle(r.data)}
          />
        ) : null}
        <Svg width="100%" height="100%" viewBox="0 0 358 220" preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d="M40 60V44a12 12 0 0 1 12-12h18M288 32h18a12 12 0 0 1 12 12v16M318 160v16a12 12 0 0 1-12 12h-18M70 188H52a12 12 0 0 1-12-12v-16" fill="none" stroke={LIME} strokeWidth={3} strokeLinecap="round" />
          <Path d="M60 110 H298" stroke={LIME} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.7} />
        </Svg>
        <Txt size={13} color="#B7BBC2" style={styles.hint}>
          {busy ? 'Recherche du produit…' : web ? 'Caméra indisponible sur ordinateur : saisis le code ci-dessous' : perm?.granted ? 'Vise le code-barres du produit' : 'Autorise la caméra pour scanner'}
        </Txt>
      </View>
      {web || !perm?.granted ? (
        <View style={[styles.input, { borderColor: t.line, backgroundColor: t.surf }]}>
          <TextInput accessibilityLabel="Code-barres" value={manual} onChangeText={setManual} keyboardType="number-pad" placeholder="Code-barres (ex. 3017620422003)" placeholderTextColor={t.ink2} style={[styles.inputText, { color: t.ink }]} onSubmitEditing={() => manual.length >= 8 && handle(manual)} />
          <Press disabled={manual.length < 8 || busy} onPress={() => handle(manual)} style={[styles.go, { backgroundColor: manual.length >= 8 ? LIME : t.track }]}>
            <Txt size={13} weight="bold" color={OBSIDIAN}>OK</Txt>
          </Press>
        </View>
      ) : null}
      <Press onPress={onCancel} style={[styles.ghost, { borderColor: t.line }]}>
        <Txt size={14} weight="semibold">Annuler</Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  cam: { height: 220, borderRadius: 30, backgroundColor: '#26282C', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', bottom: 12, left: 16, right: 16, textAlign: 'center' },
  input: { height: 50, borderWidth: 1, borderRadius: 18, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputText: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: 'DMSans_500Medium', fontVariant: ['tabular-nums'] },
  go: { height: 38, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ghost: { height: 48, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
