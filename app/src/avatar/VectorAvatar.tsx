/**
 * FITAIA Studio — perso vectoriel dessiné dans l'app, sans serveur ni compte.
 * Instantané, illimité, gratuit, hors ligne. Chaque choix de la fiche change le dessin ;
 * le selfie (optionnel) devient le visage du perso. Le rendu IA « HD » reste une option à part.
 */
import React from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Image as SvgImage, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { CharacterSheet, EYES, HAIR_COLOR, SKIN } from '@/data/character';

export const AVATAR_VB = { w: 300, h: 520 };

type Outfit = { top: string; bottom: string; shoes: string; sleeves: 'none' | 'short' | 'long'; jacket?: string; hoodie?: boolean; cargo?: boolean; crop?: boolean };
const OUTFITS: Record<string, Outfit> = {
  origine: { top: '#F0EBE0', bottom: '#2A2C30', shoes: '#F5F4F1', sleeves: 'none' },
  cargo: { top: '#1C1D1F', bottom: '#202225', shoes: '#1C1D1F', sleeves: 'none', hoodie: true, cargo: true, crop: true },
  olive: { top: '#EFE9DC', bottom: '#1C1D1F', shoes: '#2A2C30', sleeves: 'long' },
  creme: { top: '#2A2C30', bottom: '#2A2C30', shoes: '#F5F4F1', sleeves: 'short', jacket: '#F0EBE0' },
  titane: { top: '#2A2C30', bottom: '#EFE9DC', shoes: '#1C1D1F', sleeves: 'none', cargo: true },
  atelier: { top: '#141517', bottom: '#141517', shoes: '#141517', sleeves: 'short', hoodie: true, cargo: true },
};
const LIME = '#C8F03C';
const INK = '#1C1D1F';

const find = (list: { id: string; color?: string }[], id: string, fallback: string) => list.find((o) => o.id === id)?.color ?? fallback;
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
};

type Props = { sheet: CharacterSheet; outfit: string; selfieUri?: string | null; width: number; height?: number; background?: boolean };

export function VectorAvatar({ sheet, outfit, selfieUri, width, height, background = true }: Props) {
  const h = height ?? (width * AVATAR_VB.h) / AVATAR_VB.w;
  const o = OUTFITS[outfit] ?? OUTFITS.origine;
  const skin = find(SKIN, sheet.skin, '#E2B48C');
  const skinDark = shade(skin, 0.86);
  const hair = find(HAIR_COLOR, sheet.hairColor, '#4A3024');
  const eye = find(EYES, sheet.eyes, '#5B3A21');
  const fem = sheet.appearance === 'fem';
  const neutre = sheet.appearance === 'neutre';

  // ── Proportions ────────────────────────────────────────────────────────────
  const base = { mince: [44, 30, 36, 13], athle: [54, 34, 38, 16], costaud: [62, 42, 44, 22], rond: [56, 50, 52, 19] }[sheet.body] ?? [54, 34, 38, 16];
  const sh = base[0] + (fem ? -7 : neutre ? -3 : 0);
  const wa = base[1] + (fem ? -3 : 0);
  const hi = base[2] + (fem ? 7 : neutre ? 3 : 0);
  const armW = base[3];
  const legW = Math.max(16, hi * 0.72);
  const legLen = 150 + (sheet.height - 150) * 1.1; // 150 cm → 150 · 200 cm → 205
  const feetY = 300 + legLen;
  const scale = Math.min(1, 492 / (feetY + 14));

  // ── Tête ────────────────────────────────────────────────────────────────────
  const cx = 150, hy = 112;
  const face = { ovale: [34, 42], rond: [38, 39], carre: [36, 40], coeur: [37, 42], long: [31, 46] }[sheet.face] ?? [34, 42];
  const headScale = selfieUri ? 1.26 : 1.18; // avec photo : tête un peu plus grande, le visage reste lisible
  const [rx, ry] = [face[0] * headScale, face[1] * headScale];
  const headPath =
    sheet.face === 'carre'
      ? `M${cx - rx} ${hy - ry + 16} Q${cx - rx} ${hy - ry} ${cx - rx + 16} ${hy - ry} H${cx + rx - 16} Q${cx + rx} ${hy - ry} ${cx + rx} ${hy - ry + 16} V${hy + ry - 22} Q${cx + rx} ${hy + ry} ${cx + rx - 22} ${hy + ry} H${cx - rx + 22} Q${cx - rx} ${hy + ry} ${cx - rx} ${hy + ry - 22} Z`
      : sheet.face === 'coeur'
        ? `M${cx} ${hy + ry} Q${cx - rx - 2} ${hy + ry * 0.3} ${cx - rx} ${hy - ry * 0.35} Q${cx - rx} ${hy - ry} ${cx} ${hy - ry} Q${cx + rx} ${hy - ry} ${cx + rx} ${hy - ry * 0.35} Q${cx + rx + 2} ${hy + ry * 0.3} ${cx} ${hy + ry} Z`
        : `M${cx - rx} ${hy} A${rx} ${ry} 0 1 1 ${cx + rx} ${hy} A${rx} ${ry} 0 1 1 ${cx - rx} ${hy} Z`;

  const hs = sheet.hairStyle;
  const hijab = hs === 'hijab';
  const showFace = !selfieUri;

  // Cheveux arrière (derrière la tête)
  const hairBack = () => {
    if (selfieUri) return null;
    switch (hs) {
      case 'afro':
        return <Circle cx={cx} cy={hy - 6} r={rx * 1.55} fill={hair} />;
      case 'long':
        return <Path d={`M${cx - rx - 8} ${hy - 10} Q${cx - rx - 14} ${hy + 120} ${cx - rx + 6} ${hy + 150} H${cx + rx - 6} Q${cx + rx + 14} ${hy + 120} ${cx + rx + 8} ${hy - 10} Z`} fill={hair} />;
      case 'milong':
        return <Path d={`M${cx - rx - 8} ${hy - 10} Q${cx - rx - 12} ${hy + 70} ${cx - rx + 2} ${hy + 92} H${cx + rx - 2} Q${cx + rx + 12} ${hy + 70} ${cx + rx + 8} ${hy - 10} Z`} fill={hair} />;
      case 'tresses':
        return (
          <G stroke={hair} strokeWidth={7} strokeLinecap="round" fill="none">
            <Path d={`M${cx - rx + 6} ${hy + 20} q-12 40 -4 86`} />
            <Path d={`M${cx + rx - 6} ${hy + 20} q12 40 4 86`} />
            <Path d={`M${cx - 10} ${hy + 30} q-6 50 2 80`} strokeWidth={5} />
            <Path d={`M${cx + 10} ${hy + 30} q6 50 -2 80`} strokeWidth={5} />
          </G>
        );
      case 'queue':
        return <Path d={`M${cx + rx - 4} ${hy - 10} q26 30 14 110 q-8 -40 -22 -60 Z`} fill={hair} />;
      case 'chignon':
        return <Circle cx={cx} cy={hy - ry - 10} r={16} fill={hair} />;
      default:
        return null;
    }
  };

  // Cheveux avant (sur la tête)
  const hairFront = () => {
    if (selfieUri) return null;
    const cap = (yFactor: number, op = 1) => (
      <Path d={`M${cx - rx} ${hy - ry * yFactor} Q${cx - rx} ${hy - ry - 6} ${cx} ${hy - ry - 6} Q${cx + rx} ${hy - ry - 6} ${cx + rx} ${hy - ry * yFactor} Q${cx} ${hy - ry * 0.55} ${cx - rx} ${hy - ry * yFactor} Z`} fill={hair} opacity={op} />
    );
    switch (hs) {
      case 'rase':
        return cap(0.5, 0.35);
      case 'court':
        return cap(0.35);
      case 'degrade':
        return (
          <G>
            {cap(0.1, 0.45)}
            {cap(0.5)}
          </G>
        );
      case 'boucle':
        return (
          <G fill={hair}>
            {cap(0.3)}
            {[-1, -0.6, -0.2, 0.2, 0.6, 1].map((k) => (
              <Circle key={k} cx={cx + k * rx * 0.95} cy={hy - ry * 0.55 - (1 - Math.abs(k)) * 10} r={9} />
            ))}
          </G>
        );
      case 'afro':
        return cap(0.2);
      case 'tresses':
        return (
          <G>
            {cap(0.3)}
            {[-0.6, -0.2, 0.2, 0.6].map((k) => (
              <Path key={k} d={`M${cx + k * rx} ${hy - ry - 4} q2 10 0 20`} stroke={shade(hair, 1.35)} strokeWidth={1.5} fill="none" />
            ))}
          </G>
        );
      case 'milong':
      case 'long':
        return (
          <Path d={`M${cx - rx} ${hy - ry * 0.1} Q${cx - rx} ${hy - ry - 6} ${cx} ${hy - ry - 6} Q${cx + rx} ${hy - ry - 6} ${cx + rx} ${hy - ry * 0.1} Q${cx + rx * 0.7} ${hy - ry * 0.35} ${cx + rx * 0.35} ${hy - ry * 0.75} Q${cx - rx * 0.2} ${hy - ry * 0.45} ${cx - rx} ${hy - ry * 0.1} Z`} fill={hair} />
        );
      case 'chignon':
      case 'queue':
        return cap(0.3);
      case 'hijab':
        return null;
      default:
        return cap(0.35);
    }
  };

  const hijabShape = hijab ? (
    <Path d={`M${cx - rx - 10} ${hy - 4} Q${cx - rx - 12} ${hy - ry - 16} ${cx} ${hy - ry - 16} Q${cx + rx + 12} ${hy - ry - 16} ${cx + rx + 10} ${hy - 4} Q${cx + rx + 14} ${hy + 60} ${cx + rx + 18} ${hy + 84} H${cx - rx - 18} Q${cx - rx - 14} ${hy + 60} ${cx - rx - 10} ${hy - 4} Z`} fill={o.top === '#F0EBE0' || o.top === '#EFE9DC' ? '#2A2C30' : '#EFE9DC'} />
  ) : null;

  // ── Visage ──────────────────────────────────────────────────────────────────
  const ex = rx * 0.42, ey = hy - ry * 0.08;
  const beard = () => {
    const b = sheet.beard;
    if (b === 'aucune') return null;
    const jaw = `M${cx - rx + 4} ${hy + 6} Q${cx - rx + 2} ${hy + ry + 2} ${cx} ${hy + ry + 2} Q${cx + rx - 2} ${hy + ry + 2} ${cx + rx - 4} ${hy + 6} Q${cx + rx * 0.5} ${hy + ry * 0.55} ${cx} ${hy + ry * 0.6} Q${cx - rx * 0.5} ${hy + ry * 0.55} ${cx - rx + 4} ${hy + 6} Z`;
    if (b === 'trois') return <Path d={jaw} fill={hair} opacity={0.22} />;
    if (b === 'courte') return <Path d={jaw} fill={hair} opacity={0.85} />;
    if (b === 'pleine') return <Path d={`M${cx - rx + 2} ${hy + 4} Q${cx - rx} ${hy + ry + 12} ${cx} ${hy + ry + 14} Q${cx + rx} ${hy + ry + 22} ${cx + rx - 2} ${hy + 4} Q${cx + rx * 0.5} ${hy + ry * 0.5} ${cx} ${hy + ry * 0.55} Q${cx - rx * 0.5} ${hy + ry * 0.5} ${cx - rx + 2} ${hy + 4} Z`} fill={hair} />;
    return <Path d={`M${cx - 12} ${hy + ry * 0.42} q12 -6 24 0 q-12 5 -24 0 Z`} fill={hair} />;
  };

  // ── Tenue ──────────────────────────────────────────────────────────────────
  const torso = `M${cx - sh} 186 Q${cx - sh - 7} 194 ${cx - sh - 6} 212 L${cx - wa} 252 L${cx - hi} 302 H${cx + hi} L${cx + wa} 252 L${cx + sh + 6} 212 Q${cx + sh + 7} 194 ${cx + sh} 186 Q${cx} 178 ${cx - sh} 186 Z`;
  const cropY = o.crop ? 262 : 302;
  const topPath = o.crop
    ? `M${cx - sh} 186 Q${cx - sh - 7} 194 ${cx - sh - 6} 212 L${cx - wa - 2} ${cropY} H${cx + wa + 2} L${cx + sh + 6} 212 Q${cx + sh + 7} 194 ${cx + sh} 186 Q${cx} 178 ${cx - sh} 186 Z`
    : torso;
  const armEnd = (s: 1 | -1) => ({ x: cx + s * (hi + 18), y: 306 });
  const armStart = (s: 1 | -1) => ({ x: cx + s * (sh - 2), y: 196 });
  const sleeveLen = o.sleeves === 'long' ? 1 : o.sleeves === 'short' ? 0.3 : 0.12;

  const extras = new Set(sheet.extras);
  const wristL = armEnd(-1);

  return (
    <Svg width={width} height={h} viewBox={`0 0 ${AVATAR_VB.w} ${AVATAR_VB.h}`}>
      <Defs>
        <LinearGradient id="torsoShade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0.14} />
          <Stop offset="0.5" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.1} />
        </LinearGradient>
        <ClipPath id="faceClip">
          <Path d={headPath} />
        </ClipPath>
        {/* Fondu du selfie : bord adouci sur ~14 % pour éviter l'effet « collage » */}
        <RadialGradient id="faceFeather" cx={cx} cy={hy} rx={rx} ry={ry} gradientUnits="userSpaceOnUse">
          <Stop offset="0.72" stopColor="#fff" stopOpacity={1} />
          <Stop offset="0.9" stopColor="#fff" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id="faceMask" maskUnits="userSpaceOnUse" x={cx - rx - 2} y={hy - ry - 2} width={rx * 2 + 4} height={ry * 2 + 4}>
          <Path d={headPath} fill="url(#faceFeather)" />
        </Mask>
        <RadialGradient id="faceShade" cx={cx} cy={hy - ry * 0.2} rx={rx * 1.1} ry={ry * 1.1} gradientUnits="userSpaceOnUse">
          <Stop offset="0.6" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.28} />
        </RadialGradient>
      </Defs>

      {background ? (
        <G>
          <Rect x={0} y={0} width={AVATAR_VB.w} height={AVATAR_VB.h} rx={28} fill="#E6E4DF" />
          <Circle cx={236} cy={96} r={74} fill={LIME} opacity={0.95} />
          <Path d="M0 300 L120 0 H170 L0 420 Z" fill="#DEDBD5" />
          <Path d="M300 240 L200 520 H262 L300 400 Z" fill="#DAD7D0" />
        </G>
      ) : null}

      <G transform={`translate(${cx} 0) scale(${scale}) translate(${-cx} 0)`}>
        <Ellipse cx={cx} cy={feetY + 10} rx={hi + 48} ry={9} fill="#000" opacity={0.12} />
        {hairBack()}

        {/* Jambes */}
        <G stroke={o.bottom} strokeWidth={legW} strokeLinecap="round" fill="none">
          <Path d={`M${cx - hi * 0.5} 292 L${cx - hi * 0.52 - 4} ${feetY - 8}`} />
          <Path d={`M${cx + hi * 0.5} 292 L${cx + hi * 0.52 + 4} ${feetY - 8}`} />
        </G>
        {o.cargo ? (
          <G fill={shade(o.bottom, 1.35)} opacity={0.9}>
            <Rect x={cx - hi * 0.52 - 12} y={330 + legLen * 0.25} width={14} height={18} rx={3} />
            <Rect x={cx + hi * 0.52 - 2} y={330 + legLen * 0.25} width={14} height={18} rx={3} />
          </G>
        ) : null}
        {outfit === 'origine' || outfit === 'titane' ? (
          <G stroke={LIME} strokeWidth={2.5} strokeLinecap="round">
            <Path d={`M${cx - hi * 0.5 - legW * 0.3} 330 v${legLen * 0.4}`} />
            <Path d={`M${cx + hi * 0.5 + legW * 0.3} 330 v${legLen * 0.4}`} />
          </G>
        ) : null}
        {/* Chaussures */}
        <G fill={o.shoes} stroke={shade(o.shoes, 0.75)} strokeWidth={1.5}>
          <Rect x={cx - hi * 0.52 - legW * 0.5 - 10} y={feetY - 10} width={legW + 14} height={22} rx={10} />
          <Rect x={cx + hi * 0.52 - legW * 0.5 + 0} y={feetY - 10} width={legW + 14} height={22} rx={10} />
        </G>
        <G fill={LIME}>
          <Rect x={cx - hi * 0.52 - legW * 0.5 - 4} y={feetY + 4} width={legW} height={3} rx={1.5} />
          <Rect x={cx + hi * 0.52 - legW * 0.5 + 6} y={feetY + 4} width={legW} height={3} rx={1.5} />
        </G>

        {/* Bras (peau) */}
        <G stroke={skin} strokeWidth={armW} strokeLinecap="round" fill="none">
          <Path d={`M${armStart(-1).x} ${armStart(-1).y} L${armEnd(-1).x} ${armEnd(-1).y}`} />
          <Path d={`M${armStart(1).x} ${armStart(1).y} L${armEnd(1).x} ${armEnd(1).y}`} />
        </G>
        {extras.has('tatouage') ? (
          <G stroke={INK} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} fill="none">
            <Path d={`M${cx + hi + 6} 262 l6 6 l-6 6`} />
            <Path d={`M${cx + hi + 2} 276 l8 0`} />
          </G>
        ) : null}
        {/* Manches */}
        <G stroke={o.top} strokeWidth={armW + 4} strokeLinecap="round" fill="none">
          {([-1, 1] as const).map((s) => {
            const a = armStart(s), b = armEnd(s);
            return <Path key={s} d={`M${a.x} ${a.y} L${a.x + (b.x - a.x) * sleeveLen} ${a.y + (b.y - a.y) * sleeveLen}`} />;
          })}
        </G>
        {outfit === 'olive' ? (
          <G stroke={LIME} strokeWidth={1.5} fill="none" opacity={0.9}>
            {([-1, 1] as const).map((s) => {
              const a = armStart(s), b = armEnd(s);
              return <Path key={s} d={`M${a.x + s * 2} ${a.y + 6} L${b.x + s * 2} ${b.y - 6}`} />;
            })}
          </G>
        ) : null}
        {/* Mains */}
        <Circle cx={armEnd(-1).x} cy={armEnd(-1).y + 4} r={armW * 0.6} fill={skin} />
        <Circle cx={armEnd(1).x} cy={armEnd(1).y + 4} r={armW * 0.6} fill={skin} />
        {extras.has('montre') ? <Rect x={wristL.x - 9} y={wristL.y - 12} width={18} height={9} rx={3} fill={INK} stroke={LIME} strokeWidth={1.5} /> : null}

        {/* Cou + torse */}
        <Rect x={cx - 15} y={hy + ry - 12} width={30} height={48} rx={9} fill={skinDark} />
        {o.crop ? <Path d={torso} fill={skin} /> : null}
        <Path d={topPath} fill={o.top} />
        <Path d={topPath} fill="url(#torsoShade)" />
        {o.jacket ? (
          <G fill={o.jacket}>
            <Path d={`M${cx - sh} 186 Q${cx - sh - 7} 194 ${cx - sh - 6} 212 L${cx - wa} 252 L${cx - hi} 302 H${cx - 16} L${cx - 10} 230 L${cx - 18} 190 Z`} />
            <Path d={`M${cx + sh} 186 Q${cx + sh + 7} 194 ${cx + sh + 6} 212 L${cx + wa} 252 L${cx + hi} 302 H${cx + 16} L${cx + 10} 230 L${cx + 18} 190 Z`} />
          </G>
        ) : null}
        {o.hoodie ? (
          <G>
            <Path d={`M${cx - hi - 6} 296 Q${cx} 284 ${cx + hi + 6} 296 L${cx + hi + 2} 312 Q${cx} 300 ${cx - hi - 2} 312 Z`} fill="#F0EBE0" />
            <Path d={`M${cx - 6} 300 q-14 30 -4 48 M${cx + 6} 300 q14 30 4 48`} stroke="#F0EBE0" strokeWidth={10} strokeLinecap="round" fill="none" />
          </G>
        ) : null}
        {outfit === 'origine' ? <Path d={`M${cx} 200 v70`} stroke={LIME} strokeWidth={2} /> : null}
        {outfit === 'atelier' || outfit === 'cargo' ? <Circle cx={cx + sh * 0.55} cy={214} r={4} fill={LIME} /> : null}

        {/* Tête */}
        {hijabShape}
        <Circle cx={cx - rx - 2} cy={hy + 4} r={7} fill={skinDark} />
        <Circle cx={cx + rx + 2} cy={hy + 4} r={7} fill={skinDark} />
        {extras.has('boucles') ? (
          <G fill={LIME}>
            <Circle cx={cx - rx - 2} cy={hy + 10} r={2.5} />
            <Circle cx={cx + rx + 2} cy={hy + 10} r={2.5} />
          </G>
        ) : null}
        <Path d={headPath} fill={skin} />
        {selfieUri ? (
          <G>
            <SvgImage href={{ uri: selfieUri }} x={cx - rx * 1.6} y={hy - ry * 1.62} width={rx * 3.2} height={ry * 3.2} preserveAspectRatio="xMidYMid slice" mask="url(#faceMask)" />
            <Path d={headPath} fill="url(#faceShade)" />
          </G>
        ) : null}
        {showFace ? (
          <G>
            {/* Yeux */}
            <Ellipse cx={cx - ex} cy={ey} rx={7} ry={4.6} fill="#FBFAF7" />
            <Ellipse cx={cx + ex} cy={ey} rx={7} ry={4.6} fill="#FBFAF7" />
            <Circle cx={cx - ex} cy={ey} r={3.4} fill={eye} />
            <Circle cx={cx + ex} cy={ey} r={3.4} fill={eye} />
            <Circle cx={cx - ex} cy={ey} r={1.6} fill={INK} />
            <Circle cx={cx + ex} cy={ey} r={1.6} fill={INK} />
            <Circle cx={cx - ex + 1.2} cy={ey - 1.2} r={0.9} fill="#FFF" />
            <Circle cx={cx + ex + 1.2} cy={ey - 1.2} r={0.9} fill="#FFF" />
            {/* Sourcils */}
            <Path d={`M${cx - ex - 8} ${ey - 10} q8 -4 16 -1`} stroke={hair} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            <Path d={`M${cx + ex - 8} ${ey - 11} q8 -3 16 1`} stroke={hair} strokeWidth={2.4} strokeLinecap="round" fill="none" />
            {/* Nez + bouche */}
            <Path d={`M${cx} ${ey + 6} q-4 10 2 12`} stroke={skinDark} strokeWidth={1.8} strokeLinecap="round" fill="none" />
            <Path d={`M${cx - 9} ${hy + ry * 0.5} q9 7 18 0`} stroke="#9B4F45" strokeWidth={2.2} strokeLinecap="round" fill="none" />
            {beard()}
            {extras.has('lunettes') ? (
              <G stroke={INK} strokeWidth={1.8} fill="none">
                <Circle cx={cx - ex} cy={ey} r={10} />
                <Circle cx={cx + ex} cy={ey} r={10} />
                <Path d={`M${cx - ex + 10} ${ey} h${ex * 2 - 20}`} />
              </G>
            ) : null}
          </G>
        ) : null}
        {hairFront()}
        {extras.has('bandeau') ? <Rect x={cx - rx - 2} y={hy - ry * 0.62} width={rx * 2 + 4} height={9} rx={4} fill={LIME} /> : null}
        {extras.has('casquette') ? (
          <G fill="#2A2C30">
            <Path d={`M${cx - rx - 2} ${hy - ry * 0.45} Q${cx - rx - 2} ${hy - ry - 12} ${cx} ${hy - ry - 12} Q${cx + rx + 2} ${hy - ry - 12} ${cx + rx + 2} ${hy - ry * 0.45} Z`} />
            <Path d={`M${cx - rx - 2} ${hy - ry * 0.45} h${rx * 2 + 4} q14 0 16 6 q-20 4 -36 2 Z`} />
          </G>
        ) : null}
      </G>
    </Svg>
  );
}
