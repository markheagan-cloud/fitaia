import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {Kine, Label} from '../components/Kine';
import {Phone, SCREEN_W, STATUS_H, FIT_SCALE, StaticScreen} from '../components/Phone';
import {PoseSkeleton} from '../components/Pose';
import {Body3D} from '../components/Body3D';
import {BODY} from '../fonts';
import {C, CUT} from '../theme';
import {OUT, lin, pad2, rand} from '../lib';

// Personnages illustrés de l'app (assets/persos) — prénoms et statuts fictifs, comme dans les écrans de démonstration.
const PEOPLE = [
  {img: 'persos/p2.jpg', name: 'Sarah', status: 'Dispo pour parler'},
  {img: 'persos/p3.jpg', name: 'Karim', status: "Va s'entraîner"},
  {img: 'persos/p4.jpg', name: 'Inès', status: 'Motivée aujourd’hui'},
  {img: 'persos/p5.jpg', name: 'Mehdi', status: 'Travaille de nuit'},
  {img: 'persos/p6.jpg', name: 'Nour', status: 'Cherche une idée repas'},
  {img: 'persos/p1.jpg', name: 'Yanis', status: 'Dispo pour aider'},
];

// Position du visage dans chaque illustration (fraction de largeur / hauteur), mesurée sur les fichiers 480 x 600.
const FACE_AT: Record<string, [number, number]> = {
  'persos/p1.jpg': [0.72, 0.115],
  'persos/p2.jpg': [0.49, 0.13],
  'persos/p3.jpg': [0.29, 0.11],
  'persos/p4.jpg': [0.65, 0.105],
  'persos/p5.jpg': [0.47, 0.11],
  'persos/p6.jpg': [0.31, 0.105],
};

/** Pastille ronde cadrée sur le visage d'un personnage illustré. */
const FaceCircle: React.FC<{readonly src: string; readonly size: number; readonly style?: React.CSSProperties}> = ({src, size, style}) => {
  const w = size * 2.7;
  const h = (w * 600) / 480;
  const [fx, fy] = FACE_AT[src] ?? [0.5, 0.11];
  const left = Math.max(size - w, Math.min(0, size / 2 - w * fx));
  const top = Math.max(size - h, Math.min(0, size / 2 - h * fy));
  return (
    <div style={{position: 'relative', width: size, height: size, borderRadius: size / 2, overflow: 'hidden', background: '#D8D5CF', flex: 'none', ...style}}>
      <Img src={staticFile(src)} style={{position: 'absolute', width: w, height: h, left, top}} />
    </div>
  );
};

const PersonCard: React.FC<{readonly i: number; readonly w: number; readonly h: number}> = ({i, w, h}) => {
  const p = PEOPLE[i % PEOPLE.length];
  return (
    <div style={{position: 'relative', width: w, height: h, borderRadius: 36, overflow: 'hidden', background: '#2A2B2E'}}>
      <Img src={staticFile(p.img)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%', scale: '1.25', transformOrigin: '50% 10%'}} />
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)'}} />
      <div style={{position: 'absolute', left: 22, bottom: 74, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,244,241,0.94)', borderRadius: 30, padding: '9px 18px'}}>
        <div style={{width: 14, height: 14, borderRadius: 7, background: i % 3 === 1 ? '#FF9F43' : C.lime, boxShadow: '0 0 0 3px rgba(28,29,31,0.15)'}} />
        <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 22, color: C.obsidian, whiteSpace: 'nowrap'}}>{p.status}</div>
      </div>
      <div style={{position: 'absolute', left: 24, bottom: 22, fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.white}}>{p.name}</div>
    </div>
  );
};

/* ------------------------------------------------------------------ 11. MUR DE LA COMMUNAUTÉ (600–660) */
export const SWall: React.FC = () => {
  const f = useCurrentFrame() + CUT.wall;
  const l = f - CUT.wall;
  const cols = [
    {x: -370, y0: -260, v: -3.2, start: 0},
    {x: 0, y0: -560, v: 3.2, start: 2},
    {x: 370, y0: -180, v: -3.2, start: 4},
  ];
  return (
    <AbsoluteFill style={{backgroundColor: C.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 540, top: 960, rotate: '-9deg', scale: String(lin(l, [0, 60], [1.12, 1.2]))}}>
        {cols.map((c, ci) => (
          <div key={ci} style={{position: 'absolute', left: c.x - 165, top: c.y0 + c.v * l - 1100, display: 'flex', flexDirection: 'column', gap: 30}}>
            {Array.from({length: 6}).map((_, k) => (
              <div key={k} style={{opacity: lin(l - c.start - k, [0, 4], [0, 1])}}>
                <PersonCard i={ci * 2 + k} w={330} h={420} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 38% at 50% 50%, rgba(14,15,16,0.86) 0%, rgba(14,15,16,0.55) 60%, rgba(14,15,16,0.35) 100%)'}} />
      <AbsoluteFill style={{background: 'linear-gradient(to bottom, rgba(14,15,16,0.97) 0%, rgba(14,15,16,0.9) 10%, rgba(14,15,16,0) 24%)'}} />
      <Label f={f} from={600} top={150} family={BODY} size={28}>
        03 · Ta communauté
      </Label>
      <Kine f={f} text="RENCONTRE" from={600} top={640} size={150} font="semi" anim="rise" drift={0} />
      <Kine f={f} text="DES GENS" from={615} top={790} size={150} font="semi" anim="rise" drift={0} />
      <Kine f={f} text="AU MÊME POINT" from={630} top={950} size={150} font="semi" anim="rise" drift={0} />
      <Kine f={f} text="QUE TOI." from={645} top={1070} size={150} font="semi" anim="rise" color={C.lime} drift={0} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 12. FITMATCH (660–720) */
const Check: React.FC<{readonly on: number}> = ({on}) => (
  <div style={{width: 64, height: 64, borderRadius: 32, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: String(on), flex: 'none'}}>
    <svg width={34} height={34} viewBox="0 0 34 34">
      <path d="M6 18 L14 26 L28 9" stroke={C.obsidian} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

export const SMatch: React.FC = () => {
  const f = useCurrentFrame() + CUT.match;
  const l = f - CUT.match;
  const lines = [
    {t: 'Même étape.', at: 660},
    {t: 'Même objectif.', at: 675},
    {t: 'Même langue.', at: 690},
  ];
  // bouton « Dire bonjour » dans la capture (coordonnées 780 x 1688) → coordonnées de l'écran virtuel
  const bx = (SCREEN_W - SCREEN_W * FIT_SCALE) / 2 + 530 * FIT_SCALE;
  const by = STATUS_H + 1610 * FIT_SCALE;
  const tap = f - 705;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #F7F6F2 0%, #ECEAE5 65%, #E0DDD6 100%)', overflow: 'hidden'}}>
      {lines.map((x, i) =>
        f >= x.at ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 110,
              top: 110 + i * 128,
              display: 'flex',
              alignItems: 'center',
              gap: 30,
              opacity: lin(f - x.at, [0, 2], [0, 1]),
              translate: `${lin(f - x.at, [0, 7], [-60, 0], OUT)}px 0px`,
            }}
          >
            <Check on={lin(f - x.at, [0, 6], [0.3, 1], OUT)} />
            <div style={{fontFamily: BODY, fontWeight: 700, fontSize: 84, letterSpacing: '-0.02em', color: C.obsidian}}>{x.t}</div>
          </div>
        ) : null,
      )}
      <div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, perspective: 2200}}>
        <Phone
          width={560}
          statusBg="#E5E3DE"
          screenBg="#E5E3DE"
          style={{
            left: 260,
            top: 520,
            translate: `0px ${lin(l, [0, 12], [1200, 0], OUT)}px`,
            transform: `rotateY(${lin(l, [0, 50], [-16, -6])}deg) rotateX(${lin(l, [0, 50], [8, 3])}deg)`,
          }}
        >
          <StaticScreen src="screens/fitmatch.png" />
          {tap >= -6 ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: bx - 230,
                  top: by - 54,
                  width: 460,
                  height: 108,
                  borderRadius: 54,
                  background: C.white,
                  opacity: tap >= 0 ? lin(tap, [0, 8], [0.55, 0]) : 0,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: bx - 170,
                  top: by - 170,
                  width: 340,
                  height: 340,
                  borderRadius: 170,
                  border: `10px solid ${C.obsidian}`,
                  opacity: tap >= 0 ? lin(tap, [0, 12], [0.5, 0]) : 0,
                  scale: String(tap >= 0 ? lin(tap, [0, 12], [0.2, 1.2], OUT) : 0),
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: bx - 52,
                  top: by - 52,
                  width: 104,
                  height: 104,
                  borderRadius: 52,
                  background: 'rgba(255,255,255,0.75)',
                  border: '4px solid rgba(28,29,31,0.25)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                  opacity: lin(tap, [-6, -2, 8, 12], [0, 1, 1, 0]),
                  scale: String(lin(tap, [-2, 0, 4], [1, 0.82, 1])),
                }}
              />
            </>
          ) : null}
        </Phone>
      </div>
      {tap >= 2 ? (
        <div
          style={{
            position: 'absolute',
            right: 70,
            top: 470,
            background: C.obsidian,
            color: C.white,
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 34,
            padding: '20px 34px',
            borderRadius: 40,
            opacity: lin(tap, [2, 5], [0, 1]),
            scale: String(lin(tap, [2, 9], [0.7, 1], OUT)),
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          }}
        >
          Bonjour envoyé
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 13. FITMATES : LA CONVERSATION (720–780) */
const Bubble: React.FC<{
  readonly side: 'left' | 'right';
  readonly at: number;
  readonly f: number;
  readonly top: number;
  readonly children: React.ReactNode;
}> = ({side, at, f, top, children}) => {
  if (f < at) return null;
  const l = f - at;
  const right = side === 'right';
  return (
    <div
      style={{
        position: 'absolute',
        top,
        right: right ? 80 : undefined,
        left: right ? undefined : 200,
        maxWidth: 800,
        background: right ? C.lime : C.surf,
        color: C.obsidian,
        fontFamily: BODY,
        fontWeight: 500,
        fontSize: 52,
        lineHeight: 1.25,
        padding: '34px 44px',
        borderRadius: 50,
        borderBottomRightRadius: right ? 14 : 50,
        borderBottomLeftRadius: right ? 50 : 14,
        scale: String(lin(l, [0, 7], [0.4, 1], OUT)),
        opacity: lin(l, [0, 2], [0, 1]),
        transformOrigin: right ? '100% 100%' : '0% 100%',
        boxShadow: '0 30px 60px rgba(0,0,0,0.35)',
      }}
    >
      {children}
    </div>
  );
};

export const SChat: React.FC = () => {
  const f = useCurrentFrame() + CUT.chat;
  const typing = f >= 728 && f < 742;
  const chips = [
    {t: 'Courage', at: 752},
    {t: 'On lâche rien', at: 760},
  ];
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 45% at 85% 15%, rgba(200,240,60,0.12) 0%, rgba(0,0,0,0) 70%), #141517', overflow: 'hidden'}}>
      <Kine f={f} text="FITMATES." from={720} top={140} size={150} anim="slam" drift={0.02} />
      {f >= 727 ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 320, textAlign: 'center', fontFamily: BODY, fontWeight: 500, fontSize: 44, color: '#A9A7A2', opacity: lin(f, [727, 733], [0, 1])}}>
          Un binôme de régularité, pas un réseau de plus.
        </div>
      ) : null}
      <Bubble side="right" at={720} f={f} top={500}>
        Tu en es où dans ton objectif cette semaine&nbsp;?
      </Bubble>
      {f >= 728 ? (
        <FaceCircle
          src="persos/p3.jpg"
          size={96}
          style={{position: 'absolute', left: 80, top: 860, boxShadow: `0 0 0 4px ${C.lime}`, opacity: lin(f, [728, 731], [0, 1])}}
        />
      ) : null}
      {typing ? (
        <div style={{position: 'absolute', left: 200, top: 820, background: C.surf, borderRadius: 50, borderBottomLeftRadius: 14, padding: '38px 44px', display: 'flex', gap: 14}}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{width: 22, height: 22, borderRadius: 11, background: '#8D8B86', translate: `0px ${-10 * Math.max(0, Math.sin(((f - 728) / 8) * Math.PI * 2 - i * 0.9))}px`}} />
          ))}
        </div>
      ) : null}
      <Bubble side="left" at={742} f={f} top={800}>
        Yo&nbsp;! Je reprends la salle le soir, 3&nbsp;fois par semaine.
      </Bubble>
      <div style={{position: 'absolute', left: 200, top: 1190, display: 'flex', gap: 20}}>
        {chips.map((c) =>
          f >= c.at ? (
            <div
              key={c.t}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                border: '3px solid rgba(255,255,255,0.35)',
                borderRadius: 50,
                padding: '18px 32px',
                fontFamily: BODY,
                fontWeight: 600,
                fontSize: 38,
                color: C.white,
                scale: String(lin(f - c.at, [0, 6], [0.5, 1], OUT)),
                opacity: lin(f - c.at, [0, 2], [0, 1]),
              }}
            >
              <div style={{width: 16, height: 16, borderRadius: 8, background: C.lime}} />
              {c.t}
            </div>
          ) : null,
        )}
      </div>
      {f >= 766 ? (
        <div
          style={{
            position: 'absolute',
            left: 80,
            right: 80,
            top: 1420,
            background: '#232427',
            borderRadius: 40,
            padding: '30px 36px',
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            border: '2px solid #34353A',
            translate: `0px ${lin(f, [766, 773], [80, 0], OUT)}px`,
            opacity: lin(f, [766, 769], [0, 1]),
          }}
        >
          <div style={{width: 70, height: 70, borderRadius: 35, background: C.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.obsidian}}>K</div>
          <div style={{fontFamily: BODY, fontSize: 36, color: C.white}}>
            <b>Karim</b> t’a encouragé
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 14. « TU NE CHANGES PLUS SEUL » (780–840) */
export const SPayoff: React.FC = () => {
  const f = useCurrentFrame() + CUT.payoff;
  const faces = ['persos/p2.jpg', 'persos/p3.jpg', 'persos/p4.jpg', 'persos/p5.jpg', 'persos/p6.jpg', 'persos/p1.jpg'];
  return (
    <AbsoluteFill style={{backgroundColor: C.lime, overflow: 'hidden'}}>
      <Kine f={f} text="TU NE" from={780} top={250} size={230} anim="slam" color={C.obsidian} drift={0.015} />
      <Kine f={f} text="CHANGES" from={788} top={480} size={230} anim="slam" color={C.obsidian} drift={0.015} />
      <Kine f={f} text="PLUS" from={795} top={650} size={300} anim="slam" color={C.obsidian} drift={0.015} shake={8} />
      <Kine f={f} text="SEUL." from={810} top={940} size={300} anim="slam" color={C.obsidian} drift={0.015} shake={10} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 1420, display: 'flex', justifyContent: 'center'}}>
        {faces.map((src, i) =>
          f >= 814 + i * 2 ? (
            <FaceCircle
              key={i}
              src={src}
              size={150}
              style={{
                marginLeft: i === 0 ? 0 : -30,
                boxShadow: `0 0 0 7px ${C.lime}, 0 0 0 10px ${C.obsidian}`,
                translate: `0px ${lin(f - 814 - i * 2, [0, 7], [90, 0], OUT)}px`,
                opacity: lin(f - 814 - i * 2, [0, 2], [0, 1]),
              }}
            />
          ) : null,
        )}
      </div>
      {f >= 822 ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 1620, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 40, color: C.obsidian, opacity: lin(f, [822, 828], [0, 1])}}>
          Des gens qui vivent le même parcours.
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ 15. MONTÉE (840–900) */
export const SBuild: React.FC = () => {
  const f = useCurrentFrame() + CUT.build;
  if (f >= 893) return <AbsoluteFill style={{backgroundColor: '#000'}} />;
  const words = [
    {t: 'BOUGE.', at: 840, to: 848, bg: '#000', fg: C.white},
    {t: 'MANGE\nMIEUX.', at: 848, to: 855, bg: C.white, fg: C.obsidian},
    {t: 'PARLE.', at: 855, to: 863, bg: C.lime, fg: C.obsidian},
    {t: 'PROGRESSE.', at: 863, to: 870, bg: '#000', fg: C.lime},
  ];
  const w = words.find((x) => f >= x.at && f < x.to);
  if (w) {
    return (
      <AbsoluteFill style={{backgroundColor: w.bg, overflow: 'hidden'}}>
        {w.t === 'BOUGE.' ? (
          <div style={{position: 'absolute', inset: 0, opacity: 0.35}}>
            <PoseSkeleton down={0.5 - 0.5 * Math.cos(((f - 840) / 8) * Math.PI * 2)} x={580} y={1500} scale={1.1} />
          </div>
        ) : null}
        <Kine f={f} text={w.t} from={w.at} to={w.to} top={w.t.includes('\n') ? 730 : 830} size={220} anim="slam" color={w.fg} drift={0.05} />
      </AbsoluteFill>
    );
  }
  // 870–893 : la transformation en accéléré (une image 3D par image vidéo)
  const i = Math.min(24, f - 870);
  const strobe = (f - 870) % 10 === 0 ? 0.14 : 0;
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 50% at 50% 55%, #24262A 0%, #0B0B0C 70%)', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 540 - 420, top: 1800 - 70, width: 840, height: 140, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(200,240,60,0.35) 0%, rgba(200,240,60,0) 70%)'}} />
      <Body3D src={`3d/morphp_${pad2(i)}.png`} cx={540 + (rand(f) - 0.5) * 8} feetY={1800} height={1500} scale={lin(f, [870, 893], [1, 1.12])} />
      <AbsoluteFill style={{backgroundColor: C.white, opacity: strobe}} />
    </AbsoluteFill>
  );
};
