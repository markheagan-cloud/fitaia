import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Kine, Label} from '../components/Kine';
import {Brackets} from '../components/Fx';
import {Crop, HomeScreen, Phone} from '../components/Phone';
import {PoseSkeleton} from '../components/Pose';
import {BODY, DISPLAY} from '../fonts';
import {C, CUT} from '../theme';
import {INOUT, OUT, emWidth, fitSize, lin} from '../lib';

/* ------------------------------------------------------------------ 8. L'APPLI (420–480) */
export const SApp: React.FC = () => {
  const f = useCurrentFrame() + CUT.app;
  const l = f - CUT.app;
  const scroll = lin(f, [440, 468], [0, 334], INOUT);
  const rise = lin(l, [0, 14], [1300, 0], OUT);
  const pop = f - 450;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #F7F6F2 0%, #ECEAE5 65%, #E0DDD6 100%)', overflow: 'hidden'}}>
      <Label f={f} from={420} top={92} family={BODY} size={28} color="#7C7A75">
        02 · Tes outils
      </Label>
      <Kine f={f} text="TA JOURNÉE," from={420} top={150} size={120} anim="rise" color={C.obsidian} drift={0.015} />
      <Kine f={f} text={"EN UN COUP D'ŒIL."} from={435} top={290} size={70} font="semi" anim="rise" color={C.obsidian} drift={0} />
      <Phone
        width={650}
        style={{left: 215, top: 470, translate: `0px ${rise}px`, rotate: `${lin(l, [0, 24], [-9, -2.5], OUT)}deg`}}
      >
        <HomeScreen scroll={scroll} />
      </Phone>
      {pop >= 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 230,
            top: 1450,
            scale: String(lin(pop, [0, 8], [0.7, 1.08], OUT)),
            translate: `${lin(pop, [0, 8], [0, 40], OUT)}px ${lin(pop, [0, 8], [60, 0], OUT)}px`,
            opacity: lin(pop, [0, 2], [0, 1]),
            transformOrigin: '30% 50%',
            filter: 'drop-shadow(0 40px 50px rgba(0,0,0,0.35))',
          }}
        >
          <Crop src="screens/home-content.png" x={32} y={1470} w={716} h={148} scale={1.04} radius={44} style={{position: 'relative'}} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 9. POMPES COMPTÉES PAR LA CAMÉRA (480–570) */
export const SPushups: React.FC = () => {
  const f = useCurrentFrame() + CUT.pushups;
  const reps = f < 540 ? Math.floor((f - 480) / 15) + 1 : 5;
  const repAt = 480 + (reps - 1) * 15;
  const down = f < 540 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (f - 480)) / 15) : 0;
  const success = f >= 540;
  const sl = f - 540;
  const numSize = 470;
  return (
    <AbsoluteFill style={{backgroundColor: '#0B0C0D', overflow: 'hidden'}}>
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        {Array.from({length: 13}).map((_, i) => (
          <line key={i} x1={540 + (i - 6) * 70} y1={1300} x2={540 + (i - 6) * 260} y2={1920} stroke="rgba(200,240,60,0.08)" strokeWidth={2} />
        ))}
        {Array.from({length: 7}).map((_, i) => (
          <line key={`h${i}`} x1={0} y1={1300 + i * i * 14} x2={1080} y2={1300 + i * i * 14} stroke="rgba(200,240,60,0.07)" strokeWidth={2} />
        ))}
      </svg>
      <Label f={f} from={480} top={120} family={BODY} size={30}>
        Défi du jour
      </Label>
      <Kine f={f} text="5 POMPES" from={480} top={170} size={120} anim="cut" drift={0} />
      {/* compteur */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 300,
          textAlign: 'center',
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: numSize,
          lineHeight: 1,
          color: C.lime,
          scale: String(lin(f - repAt, [0, 6], [1.3, 1], OUT)),
          textShadow: '0 0 60px rgba(200,240,60,0.35)',
        }}
      >
        {reps}
      </div>
      <div style={{position: 'absolute', left: 750, top: 640, fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, color: '#4D4E51'}}>/5</div>
      {success ? (
        <svg width={1080} height={1920} style={{position: 'absolute'}}>
          <circle cx={540} cy={540} r={lin(sl, [0, 16], [120, 820], OUT)} fill="none" stroke={C.lime} strokeWidth={lin(sl, [0, 16], [26, 0])} opacity={lin(sl, [0, 16], [1, 0])} />
        </svg>
      ) : null}
      {/* squelette (comptage par la caméra) */}
      <div style={{position: 'absolute', inset: 0, opacity: success ? lin(sl, [2, 7], [1, 0]) : 1}}>
        <Brackets x={70} y={860} w={940} h={680} len={80} stroke={8} opacity={0.9} />
        <PoseSkeleton down={down} x={520} y={1470} scale={1.42} />
      </div>
      {success ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 1080,
              display: 'flex',
              justifyContent: 'center',
              opacity: lin(sl, [5, 8], [0, 1]),
              scale: String(lin(sl, [5, 12], [0.8, 1], OUT)),
            }}
          >
            <div style={{background: C.lime, color: C.obsidian, fontFamily: BODY, fontWeight: 700, fontSize: 40, letterSpacing: '0.16em', padding: '22px 48px', borderRadius: 60}}>
              DÉFI RÉUSSI
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 1220,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 28,
              opacity: lin(sl, [9, 12], [0, 1]),
              translate: `0px ${lin(sl, [9, 16], [40, 0], OUT)}px`,
            }}
          >
            <div style={{width: 110, height: 110, borderRadius: 55, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div style={{width: 58, height: 58, borderRadius: 29, border: `12px solid ${C.obsidian}`, borderRightColor: 'transparent', rotate: '45deg', boxSizing: 'border-box'}} />
            </div>
            <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 130, color: C.white, letterSpacing: '-0.02em'}}>+500</div>
          </div>
        </>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 1640,
          textAlign: 'center',
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 42,
          color: C.white,
        }}
      >
        Comptées par la caméra.
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1712, textAlign: 'center', fontFamily: BODY, fontWeight: 500, fontSize: 32, color: '#8D8B86'}}>
        Chaque défi réussi rapporte des Fitcoins.
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 10. REPAS SCANNÉ (570–600) */
const nf = (n: number) => {
  const s = String(Math.round(n));
  return s.length > 3 ? `${s.slice(0, -3)} ${s.slice(-3)}` : s;
};

export const SMeal: React.FC = () => {
  const f = useCurrentFrame() + CUT.meal;
  const l = f - CUT.meal;
  const kcal = lin(f, [573, 590], [2420, 1000], OUT);
  const segs = Math.round(lin(f, [573, 590], [0, 14], OUT));
  const pad = lin(l, [0, 7], [140, 22], OUT);
  const card = {x: 80, y: 640, w: 920, h: 600};
  const scanY = lin(f, [572, 586], [card.y, card.y + card.h], INOUT);
  const fs = fitSize(['SCANNÉS.'], 920, 130);
  const hlW = emWidth('SCANNÉS.', 'expanded', -0.02) * fs;
  return (
    <AbsoluteFill style={{backgroundColor: C.surf, overflow: 'hidden'}}>
      <Kine f={f} text="TES REPAS," from={570} top={150} size={120} anim="cut" color={C.obsidian} drift={0.01} />
      {f >= 578 ? (
        <div style={{position: 'absolute', left: 540 - hlW / 2 - 22, top: 300 + fs * 0.12, height: fs * 0.86, width: (hlW + 44) * lin(f, [578, 584], [0, 1], OUT), background: C.lime}} />
      ) : null}
      <Kine f={f} text="SCANNÉS." from={578} top={300} size={130} anim="slam" color={C.obsidian} drift={0} />
      <div
        style={{
          position: 'absolute',
          left: card.x,
          top: card.y,
          width: card.w,
          height: card.h,
          borderRadius: 64,
          background: C.white,
          boxShadow: '0 50px 100px rgba(28,29,31,0.16)',
          scale: String(lin(l, [0, 8], [0.92, 1], OUT)),
        }}
      >
        <div style={{position: 'absolute', left: 70, top: 64, fontFamily: DISPLAY, fontWeight: 800, fontSize: 170, lineHeight: 1, letterSpacing: '-0.02em', color: C.obsidian, fontVariantNumeric: 'tabular-nums'}}>
          {nf(kcal)}
        </div>
        <div style={{position: 'absolute', left: 74, top: 252, fontFamily: BODY, fontWeight: 500, fontSize: 40, color: '#6E6C67'}}>kcal restantes aujourd’hui</div>
        <div style={{position: 'absolute', left: 70, right: 70, top: 338, height: 74, display: 'flex', gap: 9}}>
          {Array.from({length: 20}).map((_, i) => (
            <div key={i} style={{flex: 1, borderRadius: 10, background: i < segs ? C.lime : '#E1DED8'}} />
          ))}
        </div>
        <div style={{position: 'absolute', left: 70, right: 70, top: 460, display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontSize: 36, color: '#6E6C67'}}>
          {[
            ['Protéines', '96 g'],
            ['Glucides', '160 g'],
            ['Lipides', '48 g'],
          ].map(([k, v]) => (
            <div key={k} style={{display: 'flex', gap: 14}}>
              <span>{k}</span>
              <span style={{fontWeight: 700, color: C.obsidian}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      {f < 588 ? (
        <div style={{position: 'absolute', left: card.x - 30, width: card.w + 60, top: scanY - 3, height: 6, background: C.lime, boxShadow: '0 0 30px 8px rgba(200,240,60,0.7)', borderRadius: 3}} />
      ) : null}
      <Brackets x={card.x - pad} y={card.y - pad} w={card.w + 2 * pad} h={card.h + 2 * pad} len={90} stroke={9} color={C.obsidian} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 1420, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 42, color: C.obsidian}}>
        Scanne ton assiette, c’est noté.
      </div>
    </AbsoluteFill>
  );
};
