import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, AMBER, RED, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { avatarConfigured, discardSelfie, keepSelfie, prepareSelfie } from '@/services/avatar';
import { caricatureConfigured } from '@/services/caricature';
import { Screen } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt } from '@/components/Txt';
import { FaceIcon } from '@/components/Icons';

type Phase = 'idle' | 'captured' | 'error';

export default function Selfie() {
  const t = useTheme();
  const router = useRouter();
  const say = useGame((s) => s.say);
  const setSelfieUri = useGame((s) => s.setSelfieUri);
  const existing = useGame((s) => s.selfieUri);
  const createMyCaricature = useGame((s) => s.createMyCaricature);

  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const tmpRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (tmpRef.current) discardSelfie(tmpRef.current);
    };
  }, []);

  const capture = async () => {
    setError('');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const useCamera = perm.granted && Platform.OS !== 'web';
      const res = useCamera
        ? await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, allowsEditing: true, aspect: [1, 1], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const prepared = await prepareSelfie(a.uri, a.width ?? 1024, a.height ?? 1024);
      tmpRef.current = prepared.uri;
      setPreview(prepared.uri);
      setPhase('captured');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’ouvrir la caméra.');
      setPhase('error');
    }
  };

  const keep = async () => {
    if (!tmpRef.current) return;
    try {
      const uri = await keepSelfie(tmpRef.current);
      tmpRef.current = null;
      setSelfieUri(uri);
      if (caricatureConfigured) {
        // le perso à son image se dessine en arrière-plan (plusieurs minutes) : on ne bloque pas l'écran
        say('Selfie enregistré. Ton perso se dessine, ça prend quelques minutes', 'ok');
        void createMyCaricature();
      } else {
        say('Selfie enregistré sur ton téléphone', 'ok');
      }
      router.replace('/creator');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
      setPhase('error');
    }
  };

  const retake = () => {
    if (tmpRef.current) discardSelfie(tmpRef.current);
    tmpRef.current = null;
    setPreview(null);
    setPhase('idle');
    setError('');
  };

  const ring = phase === 'error' ? RED : phase === 'captured' ? AMBER : LIME;
  const hint =
    phase === 'idle' ? (existing ? 'Tu as déjà un selfie. En reprendre un ?' : 'Place ton visage dans l’ovale, lumière de face') :
    phase === 'captured' ? 'On garde celle-ci ?' :
    error;
  const btn = phase === 'idle' ? 'Prendre mon selfie' : phase === 'captured' ? 'Garder et personnaliser' : 'Réessayer';

  return (
    <Screen name="selfie" gap={14}>
      <View style={[styles.cam, shadow.xl]}>
        <LinearGradient colors={[OBSIDIAN, '#26282C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.oval, { borderColor: ring }]}>
          {preview || existing ? <Image source={{ uri: preview ?? existing ?? '' }} style={styles.ovalImg} contentFit="cover" transition={200} /> : <FaceIcon />}
        </View>
        <Txt accessibilityLiveRegion="polite" size={13} color={phase === 'error' ? '#FFB8AF' : '#B7BBC2'} style={styles.hint} numberOfLines={2}>{hint}</Txt>
      </View>

      <Txt size={13} lineHeight={19} color={t.ink2} style={{ paddingHorizontal: 4, opacity: 0.85 }}>
        Ton selfie reste sur ton téléphone. Il n’est jamais stocké sur nos serveurs : il est envoyé seulement le temps de dessiner ton perso, puis oublié.
        {!avatarConfigured && !caricatureConfigured ? ' Le dessin à partir du selfie n’est pas encore disponible : ton perso garde la base choisie dans le créateur.' : ''}
      </Txt>

      <Press haptic="medium" onPress={phase === 'idle' ? capture : phase === 'captured' ? keep : retake} style={[styles.btn, { backgroundColor: LIME }, shadow.btn]}>
        <Txt size={16} weight="bold" color={OBSIDIAN}>{btn}</Txt>
      </Press>
      {phase === 'captured' ? (
        <Press onPress={retake} style={[styles.ghost, { borderColor: t.line }]}>
          <Txt size={14} weight="semibold">Reprendre la photo</Txt>
        </Press>
      ) : existing ? (
        <Press onPress={() => router.replace('/creator')} style={[styles.ghost, { borderColor: t.line }]}>
          <Txt size={14} weight="semibold">Garder l’actuel et personnaliser</Txt>
        </Press>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cam: { height: 380, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  oval: { width: 196, height: 256, borderRadius: 128, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)', overflow: 'hidden' },
  ovalImg: { width: '100%', height: '100%' },
  hint: { position: 'absolute', bottom: 16, left: 16, right: 16, textAlign: 'center' },
  btn: { height: 56, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ghost: { height: 48, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
