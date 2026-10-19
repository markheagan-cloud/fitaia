import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Kine} from '../components/Kine';
import {Body3D} from '../components/Body3D';
import {Logo} from '../components/Logo';
import {BODY, DISPLAY} from '../fonts';
import {C, CUT} from '../theme';
import {OUT, emWidth, fitSize, lin, pad2, seqIndex} from '../lib';

const FloorGlow: React.FC<{readonly y: number; readonly o?: number}> = ({y, o = 0.32}) => (
  <div
    style={{
      position: 'absolute',
      left: 540 - 440,
      top: y - 75,
      width: 880,
      height: 150,
      background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(200,240,60,${o}) 0%, rgba(200,240,60,0) 70%)`,
    }}
  />
);

/* ------------------------------------------------------------------ 16. « TON CORPS ÉVOLUE. » (900–960) */
export const SCorps: React.FC = () => {
  const f = useCurrentFrame() + CUT.corps;
  const l = f - CUT.corps;
  const v = l < 14 ? lin(l, [0, 14], [6, 24], OUT) : 24;
  const idx = seqIndex(v, 25);
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 55% at 50% 55%, #26282B 0%, #111214 60%, #070708 100%)', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: 'conic-gradient(from 180deg at 50% -10%, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.05) 160deg, rgba(200,240,60,0.08) 180deg, rgba(255,255,255,0.05) 200deg, rgba(255,255,255,0) 360deg)',
          opacity: lin(l, [0, 20], [0, 1]),
        }}
      />
      <FloorGlow y={1830} />
      <AbsoluteFill style={{scale: String(lin(l, [0, 6], [1.1, 1], OUT) * lin(l, [6, 60], [1, 1.06]))}}>
        <Body3D src="3d/morphp_00.png" cx={540} feetY={1830} height={1480} filter="brightness(0) invert(1)" opacity={lin(l, [0, 6, 40], [0.0, 0.14, 0.08])} />
        <Body3D src={`3d/morphp_${pad2(idx)}.png`} cx={540} feetY={1830} height={1480} />
      </AbsoluteFill>
      <Kine f={f} text="TON CORPS" from={900} top={140} size={150} anim="slam" drift={0.02} />
      <Kine f={f} text="ÉVOLUE." from={915} top={300} size={190} anim="slam" color={C.lime} drift={0.02} shake={6} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 17. « TON AVATAR AUSSI. » (960–1020) */
export const SAvatarAussi: React.FC = () => {
  const f = useCurrentFrame() + CUT.avatar;
  const l = f - CUT.avatar;
  const v = l < 30 ? lin(l, [0, 30], [12, 48], OUT) : 48;
  const idx = seqIndex(v, 49) % 24;
  const fast = l < 14;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 55% at 50% 52%, #2A2C2F 0%, #121315 58%, #09090A 100%)', overflow: 'hidden'}}>
      <FloorGlow y={1830} o={0.4} />
      <AbsoluteFill style={{scale: String(lin(l, [0, 60], [1.02, 1.08]))}}>
        {fast ? (
          <Body3D src={`3d/turnath_${pad2((idx + 23) % 24)}.png`} cx={540} feetY={1830} height={1480} opacity={0.35} filter="blur(2px)" />
        ) : null}
        <Body3D src={`3d/turnath_${pad2(idx)}.png`} cx={540} feetY={1830} height={1480} filter={fast ? 'blur(1px)' : undefined} />
      </AbsoluteFill>
      <Kine f={f} text="TON AVATAR" from={960} top={140} size={150} anim="slam" drift={0.02} />
      <Kine f={f} text="AUSSI." from={975} top={300} size={190} anim="slam" color={C.lime} drift={0.02} shake={6} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 18. « TON HISTOIRE RESTE. » (1020–1080) */
export const SHistoire: React.FC = () => {
  const f = useCurrentFrame() + CUT.histoire;
  const l = f - CUT.histoire;
  const figs = [
    {src: '3d/morphp_00.png', cx: 225, at: 1020, label: 'DÉPART'},
    {src: '3d/morphp_12.png', cx: 540, at: 1027, label: "AUJOURD'HUI"},
    {src: '3d/morphp_24.png', cx: 855, at: 1035, label: 'OBJECTIF'},
  ];
  const lineP = lin(f, [1020, 1045], [0, 1], OUT);
  const fs = fitSize(['RESTE.'], 920, 200);
  const hlW = emWidth('RESTE.', 'expanded', -0.02) * fs;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 50% 45%, #FAF9F6 0%, #F1EFEA 60%, #E3E0D9 100%)', overflow: 'hidden'}}>
      <AbsoluteFill style={{translate: `${lin(l, [0, 60], [14, -14])}px 0px`}}>
        {figs.map((g, i) =>
          f >= g.at ? (
            <Body3D
              key={i}
              src={g.src}
              cx={g.cx}
              feetY={1560}
              height={900}
              scale={lin(f - g.at, [0, 8], [0.9, 1], OUT)}
              opacity={lin(f - g.at, [0, 3], [0, 1])}
            />
          ) : null,
        )}
        <div style={{position: 'absolute', left: 120, top: 1617, width: 840 * lineP, height: 6, borderRadius: 3, background: C.obsidian}} />
        {figs.map((g, i) =>
          f >= g.at ? (
            <React.Fragment key={i}>
              <div style={{position: 'absolute', left: g.cx - 18, top: 1602, width: 36, height: 36, borderRadius: 18, background: i === 2 ? C.lime : C.obsidian, border: `6px solid ${C.obsidian}`, boxSizing: 'border-box', scale: String(lin(f - g.at, [0, 6], [0, 1], OUT))}} />
              <div style={{position: 'absolute', left: g.cx - 200, width: 400, top: 1660, textAlign: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 27, letterSpacing: '0.18em', color: C.obsidian, opacity: lin(f - g.at, [2, 8], [0, 1])}}>
                {g.label}
              </div>
            </React.Fragment>
          ) : null,
        )}
      </AbsoluteFill>
      <Kine f={f} text="TON HISTOIRE" from={1020} top={150} size={140} anim="slam" color={C.obsidian} drift={0.015} />
      {f >= 1035 ? (
        <div style={{position: 'absolute', left: 540 - hlW / 2 - 24, top: 310 + fs * 0.12, height: fs * 0.86, width: (hlW + 48) * lin(f, [1036, 1043], [0, 1], OUT), background: C.lime}} />
      ) : null}
      <Kine f={f} text="RESTE." from={1035} top={310} size={200} anim="slam" color={C.obsidian} drift={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 19. LOGO + APPEL À L’ACTION (1080–1260) */
export const SEnd: React.FC = () => {
  const f = useCurrentFrame() + CUT.end;
  const l = f - CUT.end;
  const pills = [
    {t: 'iPhone', at: 1140},
    {t: 'Android', at: 1146},
  ];
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 45% at 50% 42%, #2A2B2E 0%, #1C1D1F 55%, #141516 100%)', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(200,240,60,0.30) 0%, rgba(200,240,60,0) 35%)',
          opacity: lin(l, [0, 4, 40], [1, 0.9, 0.35]),
        }}
      />
      <div style={{position: 'absolute', left: 540 - 210, top: 500, scale: String(lin(l, [0, 210], [1, 1.04]))}}>
        <Logo size={420} draw={lin(l, [0, 16], [0, 1], OUT)} fScale={lin(l, [2, 10], [1.7, 1], OUT)} fOpacity={lin(l, [2, 4], [0, 1])} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 960,
          textAlign: 'center',
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: 150,
          lineHeight: 1,
          color: C.white,
          letterSpacing: `${lin(l, [6, 26], [0.5, 0.04], OUT)}em`,
          opacity: lin(l, [6, 11], [0, 1]),
          paddingLeft: `${lin(l, [6, 26], [0.5, 0.04], OUT)}em`,
        }}
      >
        FITAIA
      </div>
      {f >= 1092 && f < 1130 ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 960,
            textAlign: 'center',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 150,
            lineHeight: 1,
            letterSpacing: `${lin(l, [6, 26], [0.5, 0.04], OUT)}em`,
            paddingLeft: `${lin(l, [6, 26], [0.5, 0.04], OUT)}em`,
            color: 'transparent',
            backgroundImage: 'linear-gradient(105deg, rgba(200,240,60,0) 42%, rgba(200,240,60,1) 50%, rgba(200,240,60,0) 58%)',
            backgroundSize: '300% 100%',
            backgroundPosition: `${lin(f, [1092, 1128], [100, 0])}% 0%`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          FITAIA
        </div>
      ) : null}
      {f >= 1110 ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 1150,
            textAlign: 'center',
            fontFamily: BODY,
            fontWeight: 500,
            fontSize: 58,
            color: '#D6D4CE',
            opacity: lin(f, [1110, 1118], [0, 1]),
            translate: `0px ${lin(f, [1110, 1120], [24, 0], OUT)}px`,
          }}
        >
          Ne change plus seul.
        </div>
      ) : null}
      {f >= 1140 ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 1470,
            textAlign: 'center',
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 32,
            letterSpacing: '0.24em',
            color: C.lime,
            opacity: lin(f, [1140, 1146], [0, 1]),
          }}
        >
          BIENTÔT SUR
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 0, right: 0, top: 1535, display: 'flex', justifyContent: 'center', gap: 28}}>
        {pills.map((p) =>
          f >= p.at ? (
            <div
              key={p.t}
              style={{
                border: '3px solid rgba(255,255,255,0.4)',
                borderRadius: 60,
                padding: '24px 56px',
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: 46,
                color: C.white,
                scale: String(lin(f - p.at, [0, 7], [0.6, 1], OUT)),
                opacity: lin(f - p.at, [0, 3], [0, 1]),
              }}
            >
              {p.t}
            </div>
          ) : null,
        )}
      </div>
      <AbsoluteFill style={{backgroundColor: '#000', opacity: lin(f, [1230, 1259], [0, 1])}} />
    </AbsoluteFill>
  );
};
