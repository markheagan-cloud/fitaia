import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { currentWeight } from '@/store/profile';
import {
  AVATARS,
  DEFAULT_ANIMATION_MS,
  DEFAULT_AVATAR,
  HumanAvatarView,
  currentAndTarget,
  fitaiaHumanEngine,
  useHumanEngine,
  type BodyParameters,
  type ExpoThreeRenderer,
  type MorphStrategy,
  type RenderMode,
} from '@/human-engine';
import { Slider } from '@/components/Slider';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { CloseIcon } from '@/components/Icons';

/**
 * Labo interne du FITAIA Human Engine (non visible des utilisateurs) : valide le chargement GLB, les morphs pilotés
 * par le profil, l'interpolation et les performances. Les écrans ne parlent qu'au moteur, jamais aux morphs.
 */
export default function HumanEngineDebug() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useGame((s) => s.profile);
  const weights = useGame((s) => s.weights);
  const kg = currentWeight(profile, weights);
  const { current, target } = useMemo(() => currentAndTarget(profile, kg), [profile, kg]);
  const snap = useHumanEngine(fitaiaHumanEngine);
  const [strategy, setStrategy] = useState<MorphStrategy>(Platform.OS === 'web' ? 'gpu' : 'cpu');
  const [mode, setMode] = useState<RenderMode>('continuous');
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR.id);
  const avatar = AVATARS[avatarId] ?? DEFAULT_AVATAR;
  const [reduceMotion, setReduceMotion] = useState(false);
  const rendererRef = useRef<ExpoThreeRenderer | null>(null);
  const [scroll, setScroll] = useState(true);
  const [bench, setBench] = useState<string | null>(null);

  useEffect(() => {
    // Accès console en développement : globalThis.__fitaiaHumanEngine (tests manuels, mesures).
    if (__DEV__) (globalThis as unknown as Record<string, unknown>).__fitaiaHumanEngine = { engine: fitaiaHumanEngine, renderer: () => rendererRef.current };
  }, []);

  const runBench = () => {
    const r = rendererRef.current;
    if (!r) return;
    setBench('Mesure en cours…');
    setTimeout(() => {
      const res = r.benchmark(120);
      setBench(res.msPerFrame + ' ms par image, corps qui change à chaque image (marge : ' + res.maxFps + ' images/s possibles ; l’écran plafonne à 60 ou 120).');
    }, 50);
  };

  useEffect(() => {
    fitaiaHumanEngine.setBody(current);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    // Corps de départ = corps actuel, une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof BodyParameters) => (v: number) => fitaiaHumanEngine.setBody({ [k]: v });
  const animate = () => fitaiaHumanEngine.animateTo(target, { from: current, durationMs: reduceMotion ? 0 : DEFAULT_ANIMATION_MS });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/perso'));

  const load = snap.load;
  const loadText =
    load.status === 'idle'
      ? 'En attente du contexte 3D'
      : load.status === 'loading'
        ? 'Chargement du GLB…'
        : load.status === 'ready'
          ? 'GLB chargé en ' + load.ms + ' ms · ' + Math.round(load.bytes / 1024) + ' Ko' + (load.textureMs ? ' · textures décodées en ' + load.textureMs + ' ms' : '')
          : 'Erreur : ' + load.message;
  const r = snap.render;
  const m = snap.mesh;
  const fpsColor = !r ? t.ink2 : r.fps >= 55 ? LIME : r.fps >= 30 ? '#E9A10B' : '#E2483D';

  const stats: [string, string][] = [
    ['FPS', r ? String(r.fps) : '—'],
    ['Image', r ? r.frameMs + ' ms' : '—'],
    ['Rendu CPU', r ? r.renderMs + ' ms' : '—'],
    ['Appels de dessin', r ? String(r.drawCalls) : '—'],
    ['Sommets', m ? m.vertices.toLocaleString('fr-FR') : '—'],
    ['Triangles', m ? m.triangles.toLocaleString('fr-FR') : '—'],
    ['Textures', m ? String(m.textures) : '—'],
    ['Géométrie GPU', m ? Math.round(m.geometryBytes / 1024) + ' Ko' : '—'],
    ['Morphs', m ? m.morphTargets.length + (m.missingMorphs.length ? ' (manque ' + m.missingMorphs.join(', ') + ')' : '') : '—'],
    ['Stratégie', snap.strategy === 'gpu' ? 'GPU (shader)' : 'CPU (moteur)'],
  ];

  const fmt = (b: BodyParameters) => b.weight.toFixed(2) + ' / ' + b.bellyFat.toFixed(2) + ' / ' + b.muscle.toFixed(2);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16, gap: 14 }} scrollEnabled={scroll}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Display size={22}>Human Engine</Display>
            <Txt size={12} color={t.ink2}>Labo interne · {avatar.label}</Txt>
          </View>
          <Press accessibilityLabel="Fermer" onPress={back} style={[styles.round, { backgroundColor: t.surf }]}>
            <CloseIcon color={t.ink} />
          </Press>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Object.values(AVATARS).map((a) => (
            <Press key={a.id} accessibilityState={{ selected: avatarId === a.id }} onPress={() => setAvatarId(a.id)} style={[styles.chip, { backgroundColor: avatarId === a.id ? t.ink : 'transparent', borderColor: t.line }]}>
              <Txt size={13} weight="semibold" color={avatarId === a.id ? t.bg : t.ink}>{a.label}</Txt>
            </Press>
          ))}
        </View>

        <View>
          <HumanAvatarView
            key={avatar.id + ':' + strategy}
            avatar={avatar}
            engine={fitaiaHumanEngine}
            strategy={strategy}
            mode={mode}
            height={430}
            background={t.dark ? '#1D1F22' : '#E6E4DF'}
            onRenderer={(x) => (rendererRef.current = x)}
            onGesture={(active) => setScroll(!active)}
          />
          <View style={[styles.overlayTop, { pointerEvents: 'none' }]}>
            <View style={[styles.pill, { backgroundColor: 'rgba(18,19,21,0.72)' }]}>
              <Txt size={12} weight="bold" num color={fpsColor}>{r ? r.fps + ' FPS' : '— FPS'}</Txt>
            </View>
            {snap.animating ? (
              <View style={[styles.pill, { backgroundColor: LIME }]}>
                <Txt size={12} weight="bold" color={OBSIDIAN}>Animation</Txt>
              </View>
            ) : null}
          </View>
          <View style={styles.overlayBottom}>
            <Press accessibilityLabel="Dézoomer" onPress={() => rendererRef.current?.zoom(1.15)} style={styles.camBtn}>
              <Txt size={18} weight="bold" color="#F5F4F1">−</Txt>
            </Press>
            <Press accessibilityLabel="Recentrer" onPress={() => rendererRef.current?.resetView()} style={[styles.camBtn, { width: 84 }]}>
              <Txt size={12} weight="semibold" color="#F5F4F1">Recentrer</Txt>
            </Press>
            <Press accessibilityLabel="Zoomer" onPress={() => rendererRef.current?.zoom(1 / 1.15)} style={styles.camBtn}>
              <Txt size={18} weight="bold" color="#F5F4F1">+</Txt>
            </Press>
          </View>
        </View>

        <Txt size={13} color={load.status === 'error' ? '#E2483D' : t.ink2}>{loadText}</Txt>

        <View style={[styles.card, { backgroundColor: t.surf }]}>
          <Slider label="Poids" value={snap.body.weight} onChange={set('weight')} />
          <Slider label="Ventre" value={snap.body.bellyFat} onChange={set('bellyFat')} />
          <Slider label="Muscle" value={snap.body.muscle} onChange={set('muscle')} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Press onPress={() => fitaiaHumanEngine.setBody(current)} style={[styles.btn, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold">Corps actuel</Txt>
          </Press>
          <Press onPress={() => fitaiaHumanEngine.setBody(target)} style={[styles.btn, { borderColor: t.line }]}>
            <Txt size={14} weight="semibold">Objectif</Txt>
          </Press>
        </View>
        <Press haptic="medium" onPress={animate} style={[styles.primary, { backgroundColor: LIME }]}>
          <Txt size={15} weight="bold" color={OBSIDIAN}>Animer actuel → objectif</Txt>
        </Press>
        {reduceMotion ? <Txt size={12} color={t.ink2}>Mouvement réduit activé sur l’appareil : la transition est instantanée.</Txt> : null}

        <View style={[styles.card, { backgroundColor: t.surf, gap: 6 }]}>
          <Txt size={14} weight="bold">Profil → corps</Txt>
          <Txt size={12} num color={t.ink2}>
            {profile.heightCm} cm · {kg.toLocaleString('fr-FR')} kg → objectif {profile.targetKg.toLocaleString('fr-FR')} kg · activité {profile.activity}
          </Txt>
          <Txt size={12} num color={t.ink2}>Actuel (poids / ventre / muscle) : {fmt(current)}</Txt>
          <Txt size={12} num color={t.ink2}>Objectif : {fmt(target)}</Txt>
        </View>

        <View style={[styles.card, { backgroundColor: t.surf, gap: 6 }]}>
          <Txt size={14} weight="bold">morphTargetInfluences</Txt>
          {Object.keys(snap.morphs).map((name) => (
            <View key={name} style={styles.row}>
              <Txt size={13} color={t.ink2}>{name}</Txt>
              <Txt size={13} weight="semibold" num>{(snap.morphs[name] ?? 0).toFixed(3)}</Txt>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: t.surf, gap: 6 }]}>
          <Txt size={14} weight="bold">Performances</Txt>
          {stats.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Txt size={13} color={t.ink2}>{k}</Txt>
              <Txt size={13} weight="semibold" num style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Txt>
            </View>
          ))}
        </View>

        <Press onPress={runBench} style={[styles.wide, { borderColor: t.line }]}>
          <Txt size={14} weight="semibold">Mesurer 120 images</Txt>
        </Press>
        {bench ? <Txt size={12} num color={t.ink2}>{bench}</Txt> : null}

        <View style={[styles.card, { backgroundColor: t.surf, gap: 10 }]}>
          <Txt size={14} weight="bold">Réglages du labo</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['gpu', 'cpu'] as MorphStrategy[]).map((s) => (
              <Press key={s} accessibilityState={{ selected: strategy === s }} onPress={() => setStrategy(s)} style={[styles.chip, { backgroundColor: strategy === s ? t.ink : 'transparent', borderColor: t.line }]}>
                <Txt size={13} weight="semibold" color={strategy === s ? t.bg : t.ink}>{s === 'gpu' ? 'Morphs GPU' : 'Morphs CPU'}</Txt>
              </Press>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['continuous', 'onDemand'] as RenderMode[]).map((md) => (
              <Press key={md} accessibilityState={{ selected: mode === md }} onPress={() => setMode(md)} style={[styles.chip, { backgroundColor: mode === md ? t.ink : 'transparent', borderColor: t.line }]}>
                <Txt size={13} weight="semibold" color={mode === md ? t.bg : t.ink}>{md === 'continuous' ? 'Rendu continu' : 'À la demande'}</Txt>
              </Press>
            ))}
          </View>
          <Txt size={12} lineHeight={17} color={t.ink2}>
            GPU : three.js mélange les morphs dans le shader. CPU : le moteur mélange les sommets (repli si le GPU de l’appareil refuse les textures de morph). À la demande : l’image n’est redessinée que si le corps ou la caméra bougent (mode prévu en production) ; les FPS mesurent alors les images réellement dessinées.
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  overlayTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  overlayBottom: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  camBtn: { minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18,19,21,0.72)' },
  card: { borderRadius: 22, padding: 14, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  btn: { flex: 1, height: 48, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  wide: { height: 48, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
