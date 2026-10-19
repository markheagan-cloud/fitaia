import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '../theme';
import {lin} from '../lib';

/** Grain argentique : 8 textures de bruit en alternance, mélange « overlay ». */
export const Grain: React.FC<{readonly opacity?: number}> = ({opacity = 0.075}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img
        src={staticFile(`grain/g${f % 8}.jpg`)}
        style={{width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'overlay', opacity}}
      />
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{readonly strength?: number}> = ({strength = 0.5}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Flash sur une coupe (utilisé en TransitionSeries.Overlay). */
export const Flash: React.FC<{readonly color?: string; readonly peak?: number}> = ({color = C.white, peak = 0.9}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity: lin(f, [0, 1, durationInFrames], [peak, peak * 0.8, 0]),
        mixBlendMode: color === C.white ? 'normal' : 'screen',
      }}
    />
  );
};

/** Fuite de lumière en CSS (dégradés radiaux en mode « screen »), déterministe. */
export const LightLeak: React.FC<{readonly tint?: 'lime' | 'warm'; readonly peak?: number}> = ({tint = 'lime', peak = 0.85}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = f / Math.max(1, durationInFrames - 1);
  const o = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) * peak;
  const a = tint === 'lime' ? 'rgba(200,240,60,0.95)' : 'rgba(255,190,90,0.95)';
  const b = tint === 'lime' ? 'rgba(255,248,214,0.9)' : 'rgba(255,120,60,0.8)';
  return (
    <AbsoluteFill style={{mixBlendMode: 'screen', opacity: o, pointerEvents: 'none'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 45% at ${lin(p, [0, 1], [-10, 70])}% ${lin(p, [0, 1], [20, 45])}%, ${a} 0%, rgba(0,0,0,0) 70%)`,
          filter: 'blur(30px)',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 45% 70% at ${lin(p, [0, 1], [110, 40])}% ${lin(p, [0, 1], [80, 60])}%, ${b} 0%, rgba(0,0,0,0) 65%)`,
          filter: 'blur(40px)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Coins de viseur citron (caméra / scan). */
export const Brackets: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly len?: number;
  readonly stroke?: number;
  readonly color?: string;
  readonly opacity?: number;
}> = ({x, y, w, h, len = 90, stroke = 8, color = C.lime, opacity = 1}) => {
  const corner = (cx: number, cy: number, sx: number, sy: number, k: string) => (
    <React.Fragment key={k}>
      <div style={{position: 'absolute', left: sx > 0 ? cx : cx - len, top: sy > 0 ? cy : cy - stroke, width: len, height: stroke, background: color, borderRadius: stroke}} />
      <div style={{position: 'absolute', left: sx > 0 ? cx : cx - stroke, top: sy > 0 ? cy : cy - len, width: stroke, height: len, background: color, borderRadius: stroke}} />
    </React.Fragment>
  );
  return (
    <div style={{position: 'absolute', inset: 0, opacity, pointerEvents: 'none'}}>
      {corner(x, y, 1, 1, 'tl')}
      {corner(x + w, y, -1, 1, 'tr')}
      {corner(x, y + h, 1, -1, 'bl')}
      {corner(x + w, y + h, -1, -1, 'br')}
    </div>
  );
};
