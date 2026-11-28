import React from 'react';
import { Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { FitaiaPoseView, type PoseEvent } from '../../modules/fitaia-pose';
import { PoseSkeleton } from './PoseSkeleton';
import type { GuideStatus } from './placementGuide';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { LIME, OBSIDIAN, RED } from '@/theme/tokens';

type Props = {
  reps: number;
  target: number;
  feedback: string;
  fbKind: 'info' | 'bad' | 'good';
  placement: GuideStatus;
  lastPose: PoseEvent | null;
  onPose: (e: { nativeEvent: PoseEvent }) => void;
  onError: (e: { nativeEvent: { message: string } }) => void;
  onStop: () => void;
};

/**
 * Défi pompes en plein écran, caméra avant : la personne se voit en grand (comme dans un miroir) depuis 2 m,
 * avec son squelette par-dessus, le compteur en très gros et la consigne du moment lisible de loin.
 */
export function PushupLive({ reps, target, feedback, fbKind, placement, lastPose, onPose, onError, onStop }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const good = placement === 'ready';
  const status = good ? 'Bien placé · je compte' : placement === 'partial' ? 'Place-toi en entier' : 'Je te cherche…';
  const fb = fbKind === 'bad' ? { bg: 'rgba(58,23,20,0.88)', ink: '#FFD0C9' } : fbKind === 'good' ? { bg: 'rgba(34,48,12,0.88)', ink: '#E2FA9A' } : { bg: 'rgba(20,21,23,0.82)', ink: '#F5F4F1' };
  const build = Application.nativeBuildVersion;
  if (!FitaiaPoseView) return null;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onStop}>
      <View style={styles.root} accessibilityLabel="Défi pompes, caméra en direct">
        <FitaiaPoseView active position="front" onPose={onPose} onError={onError} style={StyleSheet.absoluteFill} />
        {lastPose ? <PoseSkeleton pose={lastPose} width={width} height={height} mirrored good={good} /> : null}
        {/* cadre de couleur : vert = bien placé, orange = à corriger ; visible de loin */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame, { borderColor: good ? LIME : '#FF9F43' }]} />

        <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
          <View style={styles.pill}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: good ? LIME : RED }} />
            <Txt size={16} weight="bold" color="#F5F4F1">{status}</Txt>
          </View>
          <Display wide size={110} num lineHeight={112} letterSpacing={-6} color="#F5F4F1" style={styles.count}>
            {reps}
            <Display wide size={40} color="#C9CCD1" letterSpacing={-1}>{'/' + target}</Display>
          </Display>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[styles.fb, { backgroundColor: fb.bg }]}>
            <Txt size={22} weight="bold" lineHeight={28} color={fb.ink}>{feedback}</Txt>
          </View>
          <Press haptic="medium" onPress={onStop} accessibilityLabel="Arrêter le défi" style={styles.stop}>
            <Txt size={18} weight="bold" color={OBSIDIAN}>Arrêter</Txt>
          </Press>
          {build ? <Txt size={11} color="rgba(245,244,241,0.55)" style={{ textAlign: 'center' }}>{'Version ' + build}</Txt> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  frame: { borderWidth: 6 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(20,21,23,0.78)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, marginTop: 8 },
  count: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, gap: 12 },
  fb: { borderRadius: 22, paddingHorizontal: 18, paddingVertical: 16 },
  stop: { backgroundColor: '#F5F4F1', borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
});
