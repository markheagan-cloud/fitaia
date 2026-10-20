import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { useGame } from '@/store/useGame';
import { useEquippedSkin } from '@/avatar/outfits';
import {
  APPEARANCE, BEARD, BODY, CharacterSheet, EXTRAS, EYES, FACE, HAIR_COLOR, HAIR_STYLE, Option, SKIN, combinations,
  previewImage,
} from '@/data/character';
import { fmt } from '@/data/content';
import { AvatarStep, avatarConfigured, avatarMode, generateAvatar, readSelfieBase64 } from '@/services/avatar';
import { Screen, Card } from '@/components/Screen';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';

function Chips({ options, value, onChange, multi }: { options: Option[]; value: string | string[]; onChange: (id: string) => void; multi?: boolean }) {
  const t = useTheme();
  const isOn = (id: string) => (multi ? (value as string[]).indexOf(id) >= 0 : value === id);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
      {options.map((o) => {
        const on = isOn(o.id);
        return (
          <Press
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[styles.chip, { backgroundColor: on ? t.ink : t.surf, borderColor: on ? t.ink : t.line }]}
          >
            {o.color ? <View style={[styles.swatch, { backgroundColor: o.color, borderColor: on ? t.bg : 'rgba(0,0,0,0.08)' }]} /> : null}
            <Txt size={13} weight="semibold" color={on ? t.bg : t.ink}>{o.label}</Txt>
          </Press>
        );
      })}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt size={12} weight="semibold" color={t.ink2} style={{ paddingHorizontal: 4 }}>{title}</Txt>
      {children}
    </View>
  );
}

/** Créateur de personnage : la fiche choisit le rendu réaliste le plus proche ; le dessin IA à ton image (Hugging Face ou serveur) est une option. */
export default function Creator() {
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const saved = useGame((s) => s.character);
  const setCharacter = useGame((s) => s.setCharacter);
  const setAvatar = useGame((s) => s.setAvatar);
  const selfieUri = useGame((s) => s.selfieUri);
  const say = useGame((s) => s.say);
  const skin = useEquippedSkin();
  const [busy, setBusy] = useState<AvatarStep | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [sheet, setSheet] = useState<CharacterSheet>(saved);
  const set = <K extends keyof CharacterSheet>(k: K, v: CharacterSheet[K]) => setSheet((s) => ({ ...s, [k]: v }));
  const toggleExtra = (id: string) => set('extras', sheet.extras.indexOf(id) >= 0 ? sheet.extras.filter((x) => x !== id) : sheet.extras.concat([id]));
  const total = useMemo(() => combinations(), []);
  const dirty = JSON.stringify(sheet) !== JSON.stringify(saved);

  const STEP: Record<AvatarStep, string> = { preparing: 'Préparation…', uploading: 'Envoi sécurisé du selfie…', drawing: 'Fito dessine ton perso…', saving: 'Dernières touches…' };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/perso');
  };

  /** Validation instantanée : le perso vectoriel est affiché partout, sans serveur. */
  const create = () => {
    setCharacter(sheet);
    say('Ton perso est prêt', 'ok');
    leave();
  };

  /** Option : dessin IA « HD » par le serveur (si configuré). */
  const draw = async () => {
    setCharacter(sheet);
    setError('');
    setBusy('preparing');
    abortRef.current = new AbortController();
    try {
      const selfie = selfieUri ? { base64: await readSelfieBase64(selfieUri) } : null;
      const result = await generateAvatar(selfie, skin.id, setBusy, abortRef.current.signal, sheet);
      if (result.simulated) say('Mode démo : le dessin réel s’activera avec le serveur configuré', 'ok');
      else {
        setAvatar({ uri: result.uri, outfit: result.outfit, createdAt: Date.now() });
        say('Ton perso est prêt', 'ok');
      }
      leave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le dessin a échoué.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen name="creator" gap={14}>
      <View style={[styles.hero, shadow.lg]}>
        <Image source={previewImage(sheet)} accessibilityLabel="Aperçu de ton perso" style={{ width: width - 32, height: 340 }} resizeMode="cover" />
        <View style={styles.tag}>
          <Txt size={12} weight="semibold" color="#F5F4F1" numberOfLines={1}>
            {busy ? STEP[busy] : dirty ? 'Perso de base le plus proche · non enregistré' : avatarConfigured ? 'Perso de base · dessine ta version à ton image' : 'Perso de base'}
          </Txt>
        </View>
      </View>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Display size={18}>Ta fiche</Display>
          <Txt size={12} num color={t.ink2}>{fmt(total)} combinaisons</Txt>
        </View>

        <Section title="Apparence"><Chips options={APPEARANCE} value={sheet.appearance} onChange={(v) => set('appearance', v)} /></Section>
        <Section title="Morphologie"><Chips options={BODY} value={sheet.body} onChange={(v) => set('body', v)} /></Section>

        <Section title="Taille">
          <View style={[styles.stepper, { backgroundColor: t.surf, borderColor: t.line }]}>
            <Press accessibilityLabel="Moins grand" onPress={() => set('height', Math.max(150, sheet.height - 1))} style={[styles.stepBtn, { backgroundColor: t.bg }]}>
              <Txt size={18} weight="bold">−</Txt>
            </Press>
            <Display size={22} num style={{ flex: 1, textAlign: 'center' }}>{sheet.height} cm</Display>
            <Press accessibilityLabel="Plus grand" onPress={() => set('height', Math.min(200, sheet.height + 1))} style={[styles.stepBtn, { backgroundColor: t.bg }]}>
              <Txt size={18} weight="bold">+</Txt>
            </Press>
          </View>
        </Section>

        <Section title="Peau"><Chips options={SKIN} value={sheet.skin} onChange={(v) => set('skin', v)} /></Section>
        <Section title="Cheveux"><Chips options={HAIR_STYLE} value={sheet.hairStyle} onChange={(v) => set('hairStyle', v)} /></Section>
        <Section title="Couleur des cheveux"><Chips options={HAIR_COLOR} value={sheet.hairColor} onChange={(v) => set('hairColor', v)} /></Section>
        <Section title="Visage"><Chips options={FACE} value={sheet.face} onChange={(v) => set('face', v)} /></Section>
        <Section title="Yeux"><Chips options={EYES} value={sheet.eyes} onChange={(v) => set('eyes', v)} /></Section>
        <Section title="Barbe"><Chips options={BEARD} value={sheet.beard} onChange={(v) => set('beard', v)} /></Section>
        <Section title="Accessoires (plusieurs possibles)"><Chips multi options={EXTRAS} value={sheet.extras} onChange={toggleExtra} /></Section>

        <View style={[styles.outfit, { backgroundColor: t.bg }]}>
          <Txt size={12} color={t.ink2}>Tenue</Txt>
          <Txt size={14} weight="bold">{skin.name}</Txt>
          <Txt size={12} color={t.ink2}>Se change dans la Boutique</Txt>
        </View>
      </Card>

      {error ? <Txt size={13} color="#B4342A" style={{ paddingHorizontal: 4 }}>{error}</Txt> : null}
      <Press haptic="medium" disabled={!!busy} onPress={create} style={[styles.primary, { backgroundColor: LIME }, shadow.btn]}>
        <Txt size={16} weight="bold" color={OBSIDIAN}>{dirty ? 'Créer mon perso' : 'Garder mon perso'}</Txt>
      </Press>
      {avatarConfigured ? (
        <Press haptic="medium" disabled={!!busy} onPress={draw} style={[styles.ghost, { borderColor: t.ink, backgroundColor: busy ? t.surf : 'transparent' }]}>
          <Txt size={14} weight="semibold">{busy ? STEP[busy] : 'Dessiner mon perso à mon image'}</Txt>
        </Press>
      ) : null}
      {avatarMode === 'server' ? (
        <Press onPress={() => router.push('/selfie')} style={[styles.ghost, { borderColor: t.line }]}>
          <Txt size={14} weight="semibold">{selfieUri ? 'Reprendre mon selfie' : 'Ajouter mon selfie (ton visage)'}</Txt>
        </Press>
      ) : null}
      <Txt size={12} lineHeight={17} color={t.ink2} style={{ paddingHorizontal: 4 }}>
        {avatarMode === 'none'
          ? 'Ta fiche choisit le rendu le plus proche parmi nos persos de base.'
          : avatarMode === 'huggingface'
            ? 'Dessin réaliste à partir de ta fiche (mode développement).'
            : 'Dessin à partir de ta fiche et de ton selfie.'}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 340, borderRadius: 28, backgroundColor: '#E6E4DF', overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  tag: { position: 'absolute', left: 10, bottom: 10, right: 10, backgroundColor: 'rgba(28,29,31,0.88)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  chip: { height: 36, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 14, height: 14, borderRadius: 999, borderWidth: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, padding: 6 },
  stepBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outfit: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  primary: { height: 54, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ghost: { height: 48, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
