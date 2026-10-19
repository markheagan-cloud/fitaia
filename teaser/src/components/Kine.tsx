import React from 'react';
import {useCurrentFrame} from 'remotion';
import {DISPLAY, DISPLAY_SEMI} from '../fonts';
import {C} from '../theme';
import {FontKey, IN, OUT, fitSize, lin, rand} from '../lib';

export type KineAnim = 'slam' | 'rise' | 'blur' | 'cut' | 'drop';

type Props = {
  readonly text: string; // « \n » = saut de ligne
  readonly from: number; // image absolue d'apparition
  readonly to?: number; // image absolue de disparition (exclue)
  readonly f: number; // image absolue courante
  readonly top: number;
  readonly size?: number; // taille maximale
  readonly maxWidth?: number;
  readonly font?: FontKey;
  readonly color?: string;
  readonly accent?: string[]; // mots en citron
  readonly accentColor?: string;
  readonly anim?: KineAnim;
  readonly align?: 'center' | 'left';
  readonly left?: number;
  readonly drift?: number; // zoom lent sur la durée de vie
  readonly shake?: number; // tremblement (px) à l'impact
  readonly lineHeight?: number;
  readonly tracking?: number;
  readonly exitAt?: number; // sortie rapide (glissement + flou) à partir de cette image
  readonly style?: React.CSSProperties;
};

/** Typographie cinétique : 1 à 4 mots par temps, attaque sèche sur le temps. */
export const Kine: React.FC<Props> = ({
  text,
  from,
  to,
  f,
  top,
  size = 160,
  maxWidth = 920,
  font = 'expanded',
  color = C.white,
  accent = [],
  accentColor = C.lime,
  anim = 'slam',
  align = 'center',
  left = 80,
  drift = 0.04,
  shake = 0,
  lineHeight = 0.96,
  tracking = -0.02,
  exitAt,
  style,
}) => {
  if (f < from || (to !== undefined && f >= to)) return null;
  const l = f - from;
  const lines = text.split('\n');
  const fs = fitSize(lines, maxWidth, size, font, tracking);
  const life = to !== undefined ? to - from : 60;
  const driftS = 1 + drift * Math.min(1, l / life);
  let scale = driftS;
  let opacity = 1;
  let blur = 0;
  let ty = 0;
  let ls = tracking;
  if (anim === 'slam') {
    scale *= lin(l, [0, 6], [1.32, 1], OUT);
    opacity = lin(l, [0, 1.5], [0, 1]);
    blur = lin(l, [0, 4], [10, 0]);
  } else if (anim === 'blur') {
    opacity = lin(l, [0, 6], [0, 1]);
    blur = lin(l, [0, 8], [24, 0], OUT);
    ls = lin(l, [0, 10], [0.18, tracking], OUT);
  } else if (anim === 'drop') {
    ty = lin(l, [0, 6], [-fs * 0.8, 0], OUT);
    opacity = lin(l, [0, 2], [0, 1]);
    blur = lin(l, [0, 4], [8, 0]);
  }
  let tx = 0;
  if (shake > 0) {
    const k = lin(l, [0, 10], [1, 0]);
    tx += (rand(f * 3.1) - 0.5) * 2 * shake * k;
    ty += (rand(f * 7.7) - 0.5) * 2 * shake * k;
  }
  if (exitAt !== undefined && f >= exitAt) {
    const e = f - exitAt;
    tx += lin(e, [0, 5], [0, -260], IN);
    blur += lin(e, [0, 5], [0, 18]);
    opacity *= lin(e, [0, 5], [1, 0]);
  }
  const family = font === 'semi' ? DISPLAY_SEMI : DISPLAY;
  const accentSet = new Set(accent);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: align === 'center' ? 0 : left,
        right: align === 'center' ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        fontFamily: family,
        fontWeight: 800,
        fontSize: fs,
        lineHeight,
        letterSpacing: `${ls}em`,
        color,
        textTransform: 'uppercase',
        whiteSpace: 'pre',
        opacity,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        scale: String(scale),
        translate: `${tx}px ${ty}px`,
        transformOrigin: align === 'center' ? '50% 50%' : '0% 50%',
        ...style,
      }}
    >
      {lines.map((line, i) => {
        const riseY = anim === 'rise' ? lin(l - i * 2, [0, 7], [fs * 1.05, 0], OUT) : 0;
        return (
          <div key={i} style={{overflow: anim === 'rise' ? 'hidden' : 'visible', paddingTop: fs * 0.04, paddingBottom: fs * 0.06}}>
            <div style={{translate: `0px ${riseY}px`}}>
              {accent.length === 0
                ? line
                : line.split(' ').map((w, j, arr) => (
                    <span key={j} style={{color: accentSet.has(w.replace(/[.,?! ]/g, '')) ? accentColor : undefined}}>
                      {w}
                      {j < arr.length - 1 ? ' ' : ''}
                    </span>
                  ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Petit libellé de chapitre (DM Sans, capitales espacées). */
export const Label: React.FC<{
  readonly children: React.ReactNode;
  readonly top: number;
  readonly f: number;
  readonly from: number;
  readonly to?: number;
  readonly color?: string;
  readonly size?: number;
  readonly family: string;
  readonly align?: 'center' | 'left';
}> = ({children, top, f, from, to, color = C.lime, size = 30, family, align = 'center'}) => {
  if (f < from || (to !== undefined && f >= to)) return null;
  const l = f - from;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: align === 'center' ? 0 : 80,
        right: align === 'center' ? 0 : undefined,
        textAlign: align,
        fontFamily: family,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: `${lin(l, [0, 12], [0.5, 0.22], OUT)}em`,
        textTransform: 'uppercase',
        color,
        opacity: lin(l, [0, 6], [0, 1]),
      }}
    >
      {children}
    </div>
  );
};
