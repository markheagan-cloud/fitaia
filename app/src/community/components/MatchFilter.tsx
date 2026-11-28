/**
 * Filtre « Me proposer » : tout le monde, seulement des femmes ou seulement des hommes.
 * Préférence d'affichage choisie par la personne, réciproque, jamais affichée sur son profil.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { LIME, OBSIDIAN, shadow } from '@/theme/tokens';
import { Press } from '@/components/Press';
import { Txt, Display } from '@/components/Txt';
import { useGame } from '@/store/useGame';
import { useCommunity, useSocial } from '../store';
import { MATCH_WITH } from '../models/types';
import type { MatchWith } from '../models/types';
import { Sheet, studio } from './kit';
import { Icon } from './icons';

export const matchWithLabel = (w: MatchWith | undefined) => MATCH_WITH.find((m) => m.id === (w ?? 'tous'))!.label;

/** Petite pastille sur le studio : ouvre la feuille de choix. */
export function MatchFilterPill({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const c = studio(t);
  const { me } = useSocial();
  const w = me?.privacy.matchWith ?? 'tous';
  return (
    <Press onPress={onPress} accessibilityLabel={'Me proposer : ' + matchWithLabel(w) + '. Modifier'} pressScale={0.96} style={[styles.pill, { backgroundColor: w === 'tous' ? c.glass : LIME }, shadow.sm]}>
      <Icon name="users" size={14} color={w === 'tous' ? t.ink : OBSIDIAN} strokeWidth={2.1} />
      <Txt size={12.5} weight="bold" color={w === 'tous' ? t.ink : OBSIDIAN}>{matchWithLabel(w)}</Txt>
      <Icon name="chevronDown" size={13} color={w === 'tous' ? t.ink2 : OBSIDIAN} strokeWidth={2.2} />
    </Press>
  );
}

export function MatchFilterSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged?: (w: MatchWith) => void }) {
  const t = useTheme();
  const { me } = useSocial();
  const setMatchWith = useCommunity((s) => s.setMatchWith);
  const cur = me?.privacy.matchWith ?? 'tous';
  const sex = useGame((s) => s.profile.sex);
  const myGender = sex === 'f' || sex === 'm' ? sex : undefined;
  const pick = (w: MatchWith) => {
    // sans genre déclaré dans le profil, on ne peut pas être proposé aux personnes qui filtrent : on le dit
    setMatchWith(w, myGender);
    onChanged?.(w);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} label="Me proposer">
      <View style={{ gap: 4 }}>
        <Display size={22}>Me proposer</Display>
        <Txt size={13.5} color={t.ink2} lineHeight={19}>
          Choisis qui FitMatch te présente. C’est réciproque : avec « Femmes », tu n’es proposé(e) qu’à des femmes. Ce choix n’apparaît jamais sur ton profil.
        </Txt>
      </View>
      <View style={{ gap: 8 }}>
        {MATCH_WITH.map((m) => {
          const on = cur === m.id;
          return (
            <Press key={m.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={m.label} onPress={() => pick(m.id)} pressScale={0.98} style={[styles.row, { borderColor: on ? t.strong : t.line, backgroundColor: on ? t.strong : 'transparent' }]}>
              <Txt size={15} weight="semibold" color={on ? t.strongInk : t.ink} style={{ flex: 1 }}>{m.label}</Txt>
              {on ? <Icon name="check" size={18} color={LIME} strokeWidth={2.4} /> : null}
            </Press>
          );
        })}
      </View>
      {!myGender ? (
        <Txt size={12.5} color={t.ink2} lineHeight={18}>
          Ton profil n’indique ni femme ni homme : les personnes qui filtrent ne te verront pas. Tu peux le changer dans ton profil FITAIA.
        </Txt>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 14 },
});
