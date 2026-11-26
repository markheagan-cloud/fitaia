/**
 * Visuels de la boutique : la tenue dessinée sur le perso de la personne, ou un cadre neutre qui le dit (jamais
 * l'image d'une autre tenue à la place). Et le pictogramme des articles « à venir », qui n'ont pas encore de dessin.
 */
import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { OBSIDIAN } from '@/theme/tokens';
import { RARITY } from '@/data/content';
import type { Rarity } from '@/inventory/types';
import { useGame } from '@/store/useGame';
import { useAvatarBase } from '@/avatar/HeroAvatar';
import { skinOf } from '@/avatar/outfits';
import { Txt } from '@/components/Txt';
import type { UpcomingKind } from './catalogue';

export const RARITY_KEY = { COMMON: 'commune', RARE: 'rare', EPIC: 'epique', LEGENDARY: 'legendaire' } as const;
export const rarityOf = (r: Rarity) => RARITY[RARITY_KEY[r]];

/** Images des tenues portées par le perso de la personne (identifiant de skin → uri). */
export function useMyOutfits(): Record<string, string> | undefined {
  const base = useAvatarBase();
  const caricature = useGame((s) => s.caricature);
  return caricature && caricature.base === base ? caricature.outfits : undefined;
}

export function OutfitArt({ itemId, rarity, height, style }: { itemId: string; rarity: Rarity; height: number; style?: StyleProp<ViewStyle> }) {
  const mine = useMyOutfits();
  const hasPerso = useGame((s) => !!s.caricature);
  const sk = skinOf(itemId);
  const uri = sk ? mine?.[sk.id] : undefined;
  if (uri) return <Image source={{ uri }} style={[{ width: '100%', height }, style as object]} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <LinearGradient colors={[rarityOf(rarity).c, OBSIDIAN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ width: '100%', height, alignItems: 'center', justifyContent: 'center', padding: 12 }, style]}>
      <Txt size={12} weight="semibold" color="#F5F4F1" style={{ textAlign: 'center' }}>
        {hasPerso ? 'Se dessine sur ton perso…' : 'Crée ton perso pour la voir sur toi'}
      </Txt>
    </LinearGradient>
  );
}

/** Pictogramme simple du type d'article (trait clair sur fond sombre) : ce n'est pas l'article, juste son genre. */
export function KindGlyph({ kind, size = 56, color = '#F5F4F1' }: { kind: UpcomingKind; size?: number; color?: string }) {
  const p = { stroke: color, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {kind === 'chaussures' ? (
        <>
          <Path d="M6 30c0-4 1-9 3-12l7 2c2 4 6 6 11 7l10 2c3 1 5 3 5 6v1H6z" {...p} />
          <Path d="M6 34h36" {...p} />
          <Path d="M17 22l2 3M21 23l2 3" {...p} />
        </>
      ) : kind === 'couvre-chef' ? (
        <>
          <Path d="M10 28c0-8 6-14 14-14s14 6 14 14z" {...p} />
          <Path d="M24 28h18c0 3-3 4-6 4H24" {...p} />
        </>
      ) : kind === 'lunettes' ? (
        <>
          <Rect x="6" y="19" width="15" height="11" rx="5" {...p} />
          <Rect x="27" y="19" width="15" height="11" rx="5" {...p} />
          <Path d="M21 23c2-2 4-2 6 0" {...p} />
        </>
      ) : kind === 'accessoire' ? (
        <>
          <Circle cx="24" cy="24" r="8" {...p} />
          <Path d="M20 16l1-7h6l1 7M20 32l1 7h6l1-7M24 21v3l2 2" {...p} />
        </>
      ) : kind === 'bas' ? (
        <Path d="M15 8h18l3 32h-8l-4-22-4 22h-8z" {...p} />
      ) : (
        <Path d="M17 8l-9 6 4 8 4-2v20h16V20l4 2 4-8-9-6c-1 3-4 5-7 5s-6-2-7-5z" {...p} />
      )}
    </Svg>
  );
}

/** Cadre « À venir » : dégradé de la rareté, pictogramme, et la mention en clair. */
export function UpcomingArt({ kind, rarity, height }: { kind: UpcomingKind; rarity: Rarity; height: number }) {
  return (
    <LinearGradient colors={[rarityOf(rarity).c, OBSIDIAN]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ width: '100%', height, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <View style={{ opacity: 0.85 }}>
        <KindGlyph kind={kind} size={Math.min(64, height * 0.4)} />
      </View>
      <Txt size={11} weight="bold" color="#F5F4F1" style={{ letterSpacing: 1.2 }}>DESSIN À VENIR</Txt>
    </LinearGradient>
  );
}
