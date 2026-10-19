/**
 * HumanAvatarView — la vue React qui héberge le rendu 3D. Elle :
 *  - crée le contexte expo-gl et l'ExpoThreeRenderer ;
 *  - charge le GLB et le branche au moteur (attachAvatar) ;
 *  - transforme les gestes en caméra (1 doigt = rotation, 2 doigts = zoom ; boutons +/− pour la souris).
 * Elle ne touche jamais aux morphs : le corps se pilote uniquement via le moteur (setBody / animateTo).
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import type { FitaiaHumanEngine } from '../core/FitaiaHumanEngine';
import type { AvatarDefinition, MorphStrategy } from '../core/types';
import { DEFAULT_AVATAR } from '../avatars';
import { loadAvatar } from './AvatarLoader';
import { ExpoThreeRenderer, type RenderMode } from './ExpoThreeRenderer';

type Props = {
  engine: FitaiaHumanEngine;
  /** Avatar à afficher (fichier + drivers + éclairage). Défaut : homme premium. Pour en changer, remonter la vue (`key`). */
  avatar?: AvatarDefinition;
  strategy?: MorphStrategy;
  mode?: RenderMode;
  background?: string;
  height: number;
  /** Donne accès aux commandes de caméra (zoom, recentrer). */
  onRenderer?: (r: ExpoThreeRenderer | null) => void;
  /** Début / fin d'un geste sur l'avatar (ex. : bloquer le défilement de la page pendant la rotation). */
  onGesture?: (active: boolean) => void;
};

const dist = (e: GestureResponderEvent) => {
  const t = e.nativeEvent.touches;
  if (!t || t.length < 2) return 0;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
};

export function HumanAvatarView({ engine, avatar = DEFAULT_AVATAR, strategy = 'gpu', mode = 'continuous', background = '#1D1F22', height, onRenderer, onGesture }: Props) {
  const rendererRef = useRef<ExpoThreeRenderer | null>(null);
  const alive = useRef(true);
  const last = useRef({ x: 0, y: 0, pinch: 0 });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      onRenderer?.(null);
      engine.detachAvatar();
    };
    // Une vue = un contexte GL : on ne recrée pas tout si le parent change de callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    rendererRef.current?.setMode(mode);
  }, [mode]);

  // Pour changer de stratégie ou de GLB, le parent remonte la vue (prop `key`) : un contexte GL neuf, rien de partagé.
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    rendererRef.current?.dispose();
    const r = new ExpoThreeRenderer(gl, engine, { background, mode, look: avatar.look });
    rendererRef.current = r;
    onRenderer?.(r);
    r.start();
    engine.setLoadState({ status: 'loading', startedAt: Date.now() });
    try {
      const loaded = await loadAvatar(avatar.source);
      if (!alive.current) return;
      engine.attachAvatar(loaded.scene, strategy, loaded.stats, avatar.drivers);
      r.setAvatar(loaded.scene);
      engine.setLoadState({ status: 'ready', ms: loaded.ms, bytes: loaded.bytes, textureMs: loaded.textureMs });
    } catch (e) {
      engine.setLoadState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  // Gestes via les props « responder » de React Native (gestionnaires d'événements, pas de PanResponder).
  const onGrant = (e: GestureResponderEvent) => {
    last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, pinch: dist(e) };
    onGesture?.(true);
  };
  const onMove = (e: GestureResponderEvent) => {
    const r = rendererRef.current;
    if (!r) return;
    const d = dist(e);
    const { pageX, pageY } = e.nativeEvent;
    if (d > 0) {
      if (last.current.pinch > 0) r.zoom(last.current.pinch / d);
      last.current = { x: pageX, y: pageY, pinch: d };
      return;
    }
    if (last.current.pinch > 0) {
      // fin d'un pincement : on repart de ce doigt sans saut de rotation
      last.current = { x: pageX, y: pageY, pinch: 0 };
      return;
    }
    r.orbit(-(pageX - last.current.x) * 0.012, (pageY - last.current.y) * 0.006);
    last.current = { x: pageX, y: pageY, pinch: 0 };
  };
  const onEnd = () => onGesture?.(false);

  return (
    <View
      style={[styles.wrap, { height, backgroundColor: background }]}
      accessibilityLabel="Avatar 3D : glisse pour tourner, pince pour zoomer"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 28, overflow: 'hidden' },
});
