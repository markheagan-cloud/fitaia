import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {Kine} from '../components/Kine';
import {Body3D} from '../components/Body3D';
import {BODY} from '../fonts';
import {FACE_POINTS, FACE_TESS} from '../faceMesh';
import {C, CUT} from '../theme';
import {INOUT, OUT, lin, rand} from '../lib';

/** Place l'image portrait (1080 x 1620) pour qu'un point source tombe sur un point écran, à l'échelle s. */
export const placePortrait = (src: [number, number], screen: [number, number], s: number): React.CSSProperties => ({
  position: 'absolute',
  left: screen[0] - src[0] * s,
  top: screen[1] - src[1] * s,
  width: 1080 * s,
  height: 1620 * s,
});

const EYES: [number, number] = [599, 621];
const EYE_L: [number, number] = [474, 614];
const MOUTH: [number, number] = [601, 875];
const NOSE: [number, number] = [616.5, 749.6];

/* ------------------------------------------------------------------ 1. ACCROCHE (0–60) */
export const SHook: React.FC = () => {
  const f = useCurrentFrame() + CUT.hook;
  const k = Math.min(3, Math.floor(f / 15));
  const t = (f % 15) / 15;
  const crops: {p: [number, number]; at: [number, number]; s: number}[] = [
    {p: EYES, at: [540, 720], s: 2.7},
    {p: EYE_L, at: [560, 700], s: 4.4},
    {p: MOUTH, at: [540, 760], s: 2.5},
    {p: NOSE, at: [540, 800], s: 1.4},
  ];
  const c = crops[k];
  const s = c.s * (1 + 0.06 * t);
  const glitch = f >= 45 && f < 53;
  const gx = glitch ? (rand(f * 5.3) - 0.5) * 60 : 0;
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const filled = f < 30 ? 1 : f < 45 ? Math.min(4, 1 + Math.floor((f - 30) / 1.5)) : 0;
  return (
    <AbsoluteFill style={{backgroundColor: C.night, overflow: 'hidden'}}>
      <Img
        src={staticFile('3d/portrait_face.png')}
        style={{
          ...placePortrait(c.p, [c.at[0] + gx, c.at[1]], s),
          filter: `brightness(${k === 3 ? 0.42 : 0.62}) contrast(1.28) saturate(0.22)`,
        }}
      />
      {glitch ? (
        <Img
          src={staticFile('3d/portrait_face.png')}
          style={{
            ...placePortrait(c.p, [c.at[0] - gx * 0.6, c.at[1] + 6], s),
            filter: 'brightness(0.5) contrast(1.4) saturate(0)',
            opacity: 0.45,
            clipPath: `inset(${30 + rand(f) * 30}% 0 ${20 + rand(f * 2) * 30}% 0)`,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(8,8,10,0.55) 0%, rgba(8,8,10,0) 26%, rgba(8,8,10,0) 52%, rgba(8,8,10,0.9) 74%, #08080A 100%)',
        }}
      />
      {/* suivi de la semaine : la série se casse jeudi */}
      <div style={{position: 'absolute', top: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 46}}>
        {days.map((d, i) => {
          const on = i < filled;
          const broken = f >= 45;
          return (
            <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16}}>
              <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 30, color: broken ? '#5A5955' : '#A9A7A2'}}>{d}</div>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  border: `3px solid ${broken ? '#4A4945' : '#A9A7A2'}`,
                  background: on ? C.white : 'transparent',
                  translate: broken ? `${(rand(f * 9 + i) - 0.5) * 10}px 0px` : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <Kine f={f} text="LUNDI." from={0} to={15} top={1330} size={200} anim="slam" />
      <Kine f={f} text={"JE M'Y\nMETS."} from={15} to={30} top={1240} size={190} anim="slam" />
      <Kine f={f} text="JEUDI." from={30} to={45} top={1330} size={200} anim="slam" color="#C9C7C2" />
      {f >= 45 && f < 52 ? (
        <>
          <Kine f={f} text={"J'ARRÊTE."} from={45} to={60} top={1330} size={170} anim="cut" color="#FF3B5C" style={{translate: `${-10 - rand(f) * 10}px 0px`, mixBlendMode: 'screen', opacity: 0.8}} />
          <Kine f={f} text={"J'ARRÊTE."} from={45} to={60} top={1330} size={170} anim="cut" color="#30E3FF" style={{translate: `${10 + rand(f * 3) * 10}px 0px`, mixBlendMode: 'screen', opacity: 0.8}} />
        </>
      ) : null}
      <Kine f={f} text={"J'ARRÊTE."} from={45} to={60} top={1330} size={170} anim="cut" shake={14} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 2. SEUL (60–120) */
export const SSeul: React.FC = () => {
  const f = useCurrentFrame() + CUT.seul;
  const l = f - CUT.seul;
  const flick = f >= 90 && f < 98 ? [0.35, 0.7, 1, 1, 0.6, 0.85, 1, 1][f - 90] : 1;
  return (
    <AbsoluteFill style={{backgroundColor: '#050506', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          opacity: 0.9 * flick,
          clipPath: 'polygon(43% 0%, 57% 0%, 84% 93%, 16% 93%)',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 60%, rgba(255,255,255,0.02) 100%)',
          filter: 'blur(14px)',
        }}
      />
      <AbsoluteFill style={{opacity: flick, background: 'radial-gradient(ellipse 34% 4.5% at 50% 91.5%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)'}} />
      <Body3D
        src="3d/hero_surpoids.png"
        cx={540}
        feetY={1760}
        height={1150}
        scale={lin(l, [0, 60], [1, 1.07])}
        filter={`brightness(${0.72 * (0.55 + 0.45 * flick)}) contrast(1.08) saturate(0.55)`}
      />
      <Kine f={f} text="TU CHANGES" from={60} top={200} size={120} anim="rise" drift={0.02} />
      <Kine f={f} text="SEUL." from={90} top={350} size={280} anim="slam" shake={12} drift={0.03} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 3. BASCULE (120–180) */
export const STurn: React.FC = () => {
  const f = useCurrentFrame() + CUT.turn;
  if (f >= 173) return <AbsoluteFill style={{backgroundColor: '#000'}} />;
  const l = f - CUT.turn;
  const zoom = lin(l, [0, 53], [1, 1.06], INOUT);
  const jit = lin(l, [0, 53], [0, 6]);
  // 3 flashs au plus par seconde, flash de la coupe (180) compris, intensité modérée (prudence photosensibilité)
  const flashes = [158, 167];
  const flash = flashes.includes(f) ? 0.5 : 0;
  // aperçu du maillage (le « double »), décalé et clignotant
  const meshOn = f >= 137 && f < 150 && rand(f) > 0.25;
  const ghostOn = f >= 150 && rand(f * 1.7) > 0.3;
  const s = 1.2;
  const off: [number, number] = [540 - NOSE[0] * s, 980 - NOSE[1] * s];
  return (
    <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
      {meshOn ? (
        <svg width={1080} height={1920} style={{position: 'absolute', opacity: 0.22 + rand(f * 3) * 0.2}}>
          {FACE_TESS.map(([a, b], i) =>
            i % 2 === 0 ? (
              <line
                key={i}
                x1={off[0] + FACE_POINTS[a][0] * s}
                y1={off[1] + FACE_POINTS[a][1] * s}
                x2={off[0] + FACE_POINTS[b][0] * s}
                y2={off[1] + FACE_POINTS[b][1] * s}
                stroke={C.lime}
                strokeWidth={1.2}
              />
            ) : null,
          )}
        </svg>
      ) : null}
      {ghostOn ? (
        <Body3D
          src={`3d/turn_${String((f * 3) % 24).padStart(2, '0')}.png`}
          cx={540}
          feetY={1820}
          height={1500}
          filter="brightness(0) invert(1)"
          opacity={0.08 + rand(f * 2.3) * 0.08}
        />
      ) : null}
      <AbsoluteFill style={{scale: String(zoom), translate: `${(rand(f) - 0.5) * jit}px ${(rand(f * 1.3) - 0.5) * jit}px`}}>
        <Kine f={f} text="ET SI" from={120} to={135} top={800} size={230} maxWidth={860} anim="slam" />
        <Kine f={f} text="TON DOUBLE" from={135} to={150} top={860} size={200} maxWidth={860} anim="slam" />
        <Kine f={f} text="CHANGEAIT" from={150} to={165} top={860} size={200} maxWidth={860} anim="slam" />
        <Kine f={f} text={'AVEC TOI ?'} from={165} to={173} top={850} size={200} maxWidth={860} anim="slam" accent={['TOI']} />
      </AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{backgroundColor: C.white, opacity: flash}} /> : null}
    </AbsoluteFill>
  );
};
