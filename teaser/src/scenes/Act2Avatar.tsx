import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {Kine, Label} from '../components/Kine';
import {Body3D} from '../components/Body3D';
import {Brackets} from '../components/Fx';
import {BODY} from '../fonts';
import {FACE_CONTOURS, FACE_POINTS, FACE_TESS} from '../faceMesh';
import {C, CUT} from '../theme';
import {INOUT, OUT, emWidth, fitSize, lin, pad2, seqIndex} from '../lib';
import {placePortrait} from './Act1';

const NOSE: [number, number] = [616.5, 749.6];
const FACE_BOX = {x0: 303, x1: 830, y0: 452, y1: 1047};

/* ------------------------------------------------------------------ 4. SCAN (180–240) */
export const SScan: React.FC = () => {
  const f = useCurrentFrame() + CUT.scan;
  const l = f - CUT.scan;
  const s = lin(l, [0, 60], [1.42, 1.5]) * lin(l, [0, 7], [1.07, 1], OUT);
  const anchor: [number, number] = [540, 1080];
  const P = (p: [number, number]): [number, number] => [anchor[0] + (p[0] - NOSE[0]) * s, anchor[1] + (p[1] - NOSE[1]) * s];
  const [bx0, by0] = P([FACE_BOX.x0, FACE_BOX.y0]);
  const [bx1, by1] = P([FACE_BOX.x1, FACE_BOX.y1]);
  const padB = lin(l, [0, 10], [300, 56], OUT);
  const scanY = lin(f, [184, 208], [by0 - 60, by1 + 60], INOUT);
  const scanning = f >= 184 && f < 210;
  const meshOpacity = f < 208 ? 0.55 : lin(f, [208, 232], [0.55, 0.16]);
  const done = f >= 210;
  const pct = Math.round(lin(f, [184, 208], [0, 100], INOUT));
  const lock = f >= 226 && f < 232;
  return (
    <AbsoluteFill style={{backgroundColor: '#101113', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,240,60,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(200,240,60,0.045) 2px, transparent 2px)',
          backgroundSize: '90px 90px',
          backgroundPosition: `0px ${-l * 2}px`,
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(200,240,60,0.08) 0%, rgba(0,0,0,0) 70%)'}} />
      <Img src={staticFile('3d/portrait_face.png')} style={{...placePortrait(NOSE, anchor, s), filter: done ? 'brightness(0.86) contrast(1.1)' : 'brightness(0.84) contrast(1.1) saturate(0.9)'}} />
      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
        <g opacity={meshOpacity}>
          {FACE_TESS.map(([a, b], i) => {
            const pa = P(FACE_POINTS[a]);
            const pb = P(FACE_POINTS[b]);
            if (Math.max(pa[1], pb[1]) > scanY && !done) return null;
            return <line key={i} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={C.lime} strokeWidth={1.3} />;
          })}
        </g>
        <g opacity={Math.min(1, meshOpacity * 1.8)}>
          {FACE_CONTOURS.map(([a, b], i) => {
            const pa = P(FACE_POINTS[a]);
            const pb = P(FACE_POINTS[b]);
            if (Math.max(pa[1], pb[1]) > scanY && !done) return null;
            return <line key={i} x1={pa[0]} y1={pa[1]} x2={pb[0]} y2={pb[1]} stroke={C.lime} strokeWidth={3} strokeLinecap="round" />;
          })}
        </g>
        <g opacity={done ? lin(f, [210, 228], [0.9, 0.0]) : 0.9}>
          {FACE_POINTS.map((p, i) => {
            if (i % 2 === 1) return null;
            const q = P(p);
            if (q[1] > scanY && !done) return null;
            const pop = scanning ? Math.max(0, 1 - (scanY - q[1]) / 50) : 0;
            return <circle key={i} cx={q[0]} cy={q[1]} r={2.4 + pop * 4} fill={C.white} />;
          })}
        </g>
      </svg>
      {scanning ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: bx0 - 120,
              width: bx1 - bx0 + 240,
              top: scanY - 200,
              height: 200,
              background: 'linear-gradient(to bottom, rgba(200,240,60,0) 0%, rgba(200,240,60,0.22) 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: bx0 - 120,
              width: bx1 - bx0 + 240,
              top: scanY - 3,
              height: 6,
              background: C.lime,
              boxShadow: '0 0 30px 8px rgba(200,240,60,0.7)',
              borderRadius: 3,
            }}
          />
        </>
      ) : null}
      <Brackets x={bx0 - padB} y={by0 - padB} w={bx1 - bx0 + 2 * padB} h={by1 - by0 + 2 * padB} len={100} stroke={9} color={lock ? C.white : C.lime} />
      <AbsoluteFill style={{background: 'linear-gradient(to bottom, rgba(16,17,19,0.85) 0%, rgba(16,17,19,0) 20%, rgba(16,17,19,0) 72%, rgba(16,17,19,0.95) 88%)'}} />
      <Kine f={f} text="TA PHOTO." from={180} to={210} top={110} size={160} anim="slam" />
      <Kine f={f} text="TON AVATAR." from={210} top={110} size={160} anim="slam" accent={['AVATAR']} />
      {/* HUD */}
      <div style={{position: 'absolute', left: 140, right: 140, top: 1690}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontWeight: 700, fontSize: 28, letterSpacing: '0.2em', color: done ? C.lime : '#B9B7B1'}}>
          <span>{done ? 'AVATAR CRÉÉ' : 'SCAN DU VISAGE'}</span>
          <span style={{fontVariantNumeric: 'tabular-nums'}}>{pct} %</span>
        </div>
        <div style={{marginTop: 18, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.14)'}}>
          <div style={{width: `${pct}%`, height: 8, borderRadius: 4, background: C.lime, boxShadow: '0 0 16px rgba(200,240,60,0.6)'}} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 5. ROTATION « IL TE RESSEMBLE » (240–300) */
export const SSpin: React.FC = () => {
  const f = useCurrentFrame() + CUT.spin;
  const l = f - CUT.spin;
  const v = l < 28 ? lin(l, [0, 28], [0, 24], OUT) : 24;
  const idx = seqIndex(v, 25) % 24;
  const fast = l < 16;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 55% at 50% 52%, #2A2C2F 0%, #121315 58%, #09090A 100%)', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: 540 - 420,
          top: 1800 - 70,
          width: 840,
          height: 140,
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(200,240,60,0.32) 0%, rgba(200,240,60,0) 70%)',
        }}
      />
      <AbsoluteFill style={{scale: String(lin(l, [0, 60], [1, 1.05]))}}>
        {fast ? (
          <>
            <Body3D src={`3d/turn_${pad2((idx + 22) % 24)}.png`} cx={540} feetY={1800} height={1500} opacity={0.18} filter="blur(3px)" />
            <Body3D src={`3d/turn_${pad2((idx + 23) % 24)}.png`} cx={540} feetY={1800} height={1500} opacity={0.35} filter="blur(2px)" />
          </>
        ) : null}
        <Body3D src={`3d/turn_${pad2(idx)}.png`} cx={540} feetY={1800} height={1500} filter={fast ? 'blur(1.2px)' : undefined} />
      </AbsoluteFill>
      <Kine f={f} text="IL TE" from={255} top={150} size={130} anim="rise" drift={0.02} />
      <Kine f={f} text="RESSEMBLE." from={270} top={290} size={130} anim="rise" drift={0.02} accent={['RESSEMBLE']} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 6. ÉVOLUTION (300–360) */
const Track: React.FC<{readonly progress: number; readonly top: number; readonly dark?: boolean}> = ({progress, top, dark = false}) => {
  const xs = [170, 540, 910];
  const labels = ['DÉPART', "AUJOURD'HUI", 'OBJECTIF'];
  const fillX = 170 + (910 - 170) * progress;
  return (
    <div style={{position: 'absolute', left: 0, top, width: 1080, height: 120}}>
      <div style={{position: 'absolute', left: 170, width: 740, top: 14, height: 6, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.18)' : '#D3D0C9'}} />
      <div style={{position: 'absolute', left: 170, width: fillX - 170, top: 14, height: 6, borderRadius: 3, background: dark ? C.lime : C.obsidian}} />
      {xs.map((x, i) => {
        const on = fillX >= x - 1;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute',
                left: x - 17,
                top: 0,
                width: 34,
                height: 34,
                borderRadius: 17,
                background: on ? C.lime : dark ? '#2A2B2E' : C.surf,
                border: `5px solid ${on ? C.obsidian : dark ? '#55565A' : '#C9C6BF'}`,
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x - 200,
                width: 400,
                top: 52,
                textAlign: 'center',
                fontFamily: BODY,
                fontWeight: 700,
                fontSize: 27,
                letterSpacing: '0.18em',
                color: on ? (dark ? C.white : C.obsidian) : dark ? '#77767A' : '#A19E97',
              }}
            >
              {labels[i]}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const SEvolve: React.FC = () => {
  const f = useCurrentFrame() + CUT.evolve;
  const l = f - CUT.evolve;
  const v = l < 12 ? 0 : l < 22 ? lin(l, [12, 22], [0, 12], INOUT) : l < 40 ? 12 : lin(l, [40, 50], [12, 24], INOUT);
  const idx = seqIndex(v, 25);
  const fs = fitSize(['AVEC TOI.'], 920, 130);
  const hlW = emWidth('AVEC TOI.', 'expanded', -0.02) * fs;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 50% 45%, #F8F7F3 0%, #ECEAE5 62%, #DDDAD3 100%)', overflow: 'hidden'}}>
      <AbsoluteFill style={{scale: String(lin(l, [0, 60], [1, 1.045]))}}>
        <Body3D src="3d/morphp_00.png" cx={540} feetY={1690} height={1400} filter="brightness(0)" opacity={lin(v, [0, 8], [0, 0.11])} />
        <Body3D src={`3d/morphp_${pad2(idx)}.png`} cx={540} feetY={1690} height={1400} filter="contrast(1.06)" />
      </AbsoluteFill>
      <Kine f={f} text="IL ÉVOLUE" from={300} top={140} size={130} anim="rise" color={C.obsidian} drift={0.02} />
      {f >= 330 ? (
        <div
          style={{
            position: 'absolute',
            left: 540 - hlW / 2 - 22,
            top: 290 + fs * 0.12,
            height: fs * 0.86,
            width: (hlW + 44) * lin(f, [331, 339], [0, 1], OUT),
            background: C.lime,
          }}
        />
      ) : null}
      <Kine f={f} text="AVEC TOI." from={330} top={290} size={130} anim="rise" color={C.obsidian} drift={0} />
      <Track progress={v / 24} top={1770} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 7. TRIPTYQUE « OÙ TU VAS » (360–420) */
export const STrio: React.FC = () => {
  const f = useCurrentFrame() + CUT.trio;
  const l = f - CUT.trio;
  const figs = [
    {src: '3d/morphp_00.png', cx: 220, at: 360, filter: 'brightness(0.42) saturate(0.45)', label: 'DÉPART'},
    {src: '3d/morphp_12.png', cx: 540, at: 367, filter: 'brightness(0.68) saturate(0.7)', label: "AUJOURD'HUI"},
    {src: '3d/morphp_24.png', cx: 860, at: 375, filter: 'brightness(1.06) contrast(1.04)', label: 'OBJECTIF'},
  ];
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 55% at 60% 60%, #1E2023 0%, #0E0F10 70%)', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          left: 860 - 330,
          top: 760,
          width: 660,
          height: 1100,
          opacity: lin(f, [375, 385], [0, 1]),
          background: 'radial-gradient(ellipse 50% 50% at 50% 55%, rgba(200,240,60,0.24) 0%, rgba(200,240,60,0) 70%)',
        }}
      />
      <AbsoluteFill style={{scale: String(lin(l, [0, 60], [1, 1.04])), translate: `${lin(l, [0, 60], [12, -12])}px 0px`}}>
        {figs.map((g, i) =>
          f >= g.at ? (
            <Body3D
              key={i}
              src={g.src}
              cx={g.cx}
              feetY={1700}
              height={1060}
              scale={lin(f - g.at, [0, 8], [1.14, 1], OUT)}
              opacity={lin(f - g.at, [0, 2], [0, 1])}
              filter={`${g.filter} brightness(${lin(f - g.at, [0, 5], [2.2, 1])})`}
            />
          ) : null,
        )}
      </AbsoluteFill>
      {figs.map((g, i) =>
        f >= g.at + 4 ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: g.cx - 200,
              width: 400,
              top: 1755,
              textAlign: 'center',
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: '0.2em',
              color: i === 2 ? C.lime : '#8E8C88',
              opacity: lin(f - g.at - 4, [0, 6], [0, 1]),
            }}
          >
            {g.label}
          </div>
        ) : null,
      )}
      <Label f={f} from={360} top={120} family={BODY} size={28}>
        01 · Ton avatar
      </Label>
      <Kine f={f} text={"L'AVATAR TE MONTRE"} from={390} top={185} size={66} font="semi" anim="rise" drift={0} />
      <Kine f={f} text="OÙ TU VAS." from={397} top={270} size={160} anim="slam" color={C.lime} drift={0.02} />
    </AbsoluteFill>
  );
};

