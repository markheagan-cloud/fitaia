import React from 'react';
import {Img, staticFile} from 'remotion';
import {BODY} from '../fonts';

/** Écran virtuel : 780 x 1688 (capture 390 x 844 @2x de l'app). La barre d'état occupe les 90 premiers px. */
export const SCREEN_W = 780;
export const SCREEN_H = 1688;
export const STATUS_H = 90;

const StatusBar: React.FC<{readonly bg: string}> = ({bg}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: STATUS_H, background: bg}}>
    <div style={{position: 'absolute', left: 74, top: 30, fontFamily: BODY, fontWeight: 700, fontSize: 32, color: '#1C1D1F'}}>9:41</div>
    <svg style={{position: 'absolute', right: 60, top: 34}} width={150} height={26} viewBox="0 0 150 26">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 11} y={18 - i * 5} width={7} height={8 + i * 5} rx={2} fill="#1C1D1F" />
      ))}
      <path d="M62 10 a16 16 0 0 1 22 0" stroke="#1C1D1F" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M66 15 a10 10 0 0 1 14 0" stroke="#1C1D1F" strokeWidth={4} fill="none" strokeLinecap="round" />
      <circle cx={73} cy={20} r={3} fill="#1C1D1F" />
      <rect x={98} y={4} width={40} height={20} rx={6} stroke="#1C1D1F" strokeWidth={2.5} fill="none" />
      <rect x={102} y={8} width={30} height={12} rx={3} fill="#1C1D1F" />
      <rect x={140} y={10} width={4} height={8} rx={1.5} fill="#1C1D1F" />
    </svg>
  </div>
);

type PhoneProps = {
  readonly width: number;
  readonly children: React.ReactNode; // contenu en coordonnées virtuelles 780 x 1688
  readonly screenBg?: string;
  readonly statusBg?: string;
  readonly style?: React.CSSProperties;
};

/** Cadre de téléphone dessiné en CSS (aucune marque), écran à l'échelle. */
export const Phone: React.FC<PhoneProps> = ({width, children, screenBg = '#E6E4DF', statusBg = '#E6E4DF', style}) => {
  const bezel = Math.round(width * 0.032);
  const sw = width - 2 * bezel;
  const s = sw / SCREEN_W;
  const sh = SCREEN_H * s;
  const h = sh + 2 * bezel;
  return (
    <div
      style={{
        position: 'absolute',
        width,
        height: h,
        borderRadius: width * 0.16,
        background: 'linear-gradient(145deg, #2A2B2E 0%, #0D0E0F 40%, #0D0E0F 70%, #2A2B2E 100%)',
        boxShadow: '0 70px 140px rgba(0,0,0,0.38), 0 20px 40px rgba(0,0,0,0.22), inset 0 0 0 3px #3A3B3E',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: bezel,
          top: bezel,
          width: sw,
          height: sh,
          borderRadius: width * 0.135,
          overflow: 'hidden',
          background: screenBg,
        }}
      >
        <div style={{position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, scale: String(s), transformOrigin: '0 0'}}>
          {children}
          <StatusBar bg={statusBg} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: bezel + 20 * s,
          left: width / 2 - 120 * s,
          width: 240 * s,
          height: 68 * s,
          borderRadius: 40 * s,
          background: '#000',
        }}
      />
    </div>
  );
};

/** Accueil FITAIA : contenu défilant + en-tête et barre d'onglets fixes (captures réelles de l'app). */
export const HomeScreen: React.FC<{readonly scroll: number}> = ({scroll}) => (
  <>
    <Img src={staticFile('screens/home-content.png')} style={{position: 'absolute', left: 0, top: STATUS_H - scroll, width: SCREEN_W}} />
    <Img src={staticFile('screens/home-header.png')} style={{position: 'absolute', left: 0, top: STATUS_H, width: SCREEN_W}} />
    <Img src={staticFile('screens/home-tabbar.png')} style={{position: 'absolute', left: 0, bottom: 0, width: SCREEN_W}} />
  </>
);

/** Capture plein écran réduite pour laisser la place à la barre d'état. */
export const FIT_SCALE = (SCREEN_H - STATUS_H) / SCREEN_H;
export const StaticScreen: React.FC<{readonly src: string}> = ({src}) => (
  <Img
    src={staticFile(src)}
    style={{
      position: 'absolute',
      left: (SCREEN_W - SCREEN_W * FIT_SCALE) / 2,
      top: STATUS_H,
      width: SCREEN_W * FIT_SCALE,
    }}
  />
);

/** Découpe d'une zone de capture (coordonnées de l'image source, largeur 780). */
export const Crop: React.FC<{
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly radius?: number;
  readonly style?: React.CSSProperties;
}> = ({src, x, y, w, h, scale, radius = 0, style}) => (
  <div style={{position: 'absolute', width: w * scale, height: h * scale, overflow: 'hidden', borderRadius: radius * scale, ...style}}>
    <Img src={staticFile(src)} style={{position: 'absolute', width: SCREEN_W * scale, left: -x * scale, top: -y * scale}} />
  </div>
);
