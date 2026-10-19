import React from 'react';
import {C} from '../theme';

type P = [number, number];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Squelette de pompe vu de profil (points clés façon détection de pose). down : 0 = bras tendus, 1 = en bas. */
export const pushupPose = (down: number) => {
  const ankle: P = [-330, 0];
  const wrist: P = [235, 0];
  const shoulder: P = [mix(238, 214, down), mix(-292, -112, down)];
  const body = sub(shoulder, ankle);
  const dir = mul(body, 1 / len(body));
  const perp: P = [dir[1], -dir[0]]; // vers le haut
  const hip = add(ankle, mul(body, 0.53));
  const knee = add(ankle, mul(body, 0.27));
  const neck = add(shoulder, mul(dir, 34));
  const head = add(add(shoulder, mul(dir, 92)), mul(perp, -6));
  // coude : IK à deux segments (bras 160, avant-bras 150), coude vers l'arrière
  const a = 160;
  const b = 150;
  const d = sub(wrist, shoulder);
  const dl = Math.min(len(d), a + b - 0.01);
  const cosA = (a * a + dl * dl - b * b) / (2 * a * dl);
  const ang = Math.atan2(d[1], d[0]) + Math.acos(Math.max(-1, Math.min(1, cosA)));
  const elbow: P = [shoulder[0] + a * Math.cos(ang), shoulder[1] + a * Math.sin(ang)];
  return {ankle, knee, hip, shoulder, elbow, wrist, neck, head};
};

export const PoseSkeleton: React.FC<{
  readonly down: number;
  readonly x: number;
  readonly y: number; // position du sol
  readonly scale: number;
  readonly glow?: number;
}> = ({down, x, y, scale, glow = 1}) => {
  const p = pushupPose(down);
  const bones: [keyof typeof p, keyof typeof p][] = [
    ['ankle', 'knee'],
    ['knee', 'hip'],
    ['hip', 'shoulder'],
    ['shoulder', 'elbow'],
    ['elbow', 'wrist'],
    ['shoulder', 'neck'],
  ];
  const T = (q: P) => `${x + q[0] * scale},${y + q[1] * scale}`;
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0}}>
      <defs>
        <filter id="glowPose" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={10} />
        </filter>
      </defs>
      <line x1={x - 470 * scale} y1={y} x2={x + 420 * scale} y2={y} stroke="rgba(255,255,255,0.22)" strokeWidth={3} />
      <g opacity={0.55 * glow} filter="url(#glowPose)">
        {bones.map(([s, e], i) => (
          <polyline key={i} points={`${T(p[s])} ${T(p[e])}`} stroke={C.lime} strokeWidth={22 * scale} strokeLinecap="round" fill="none" />
        ))}
      </g>
      {bones.map(([s, e], i) => (
        <polyline key={i} points={`${T(p[s])} ${T(p[e])}`} stroke={C.white} strokeWidth={9 * scale} strokeLinecap="round" fill="none" />
      ))}
      <circle cx={x + p.head[0] * scale} cy={y + p.head[1] * scale} r={42 * scale} fill="none" stroke={C.white} strokeWidth={8 * scale} />
      {(['ankle', 'knee', 'hip', 'shoulder', 'elbow', 'wrist'] as const).map((k) => (
        <circle key={k} cx={x + p[k][0] * scale} cy={y + p[k][1] * scale} r={13 * scale} fill={C.lime} stroke={C.ink} strokeWidth={4 * scale} />
      ))}
    </svg>
  );
};
