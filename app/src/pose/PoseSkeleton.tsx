import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import type { PoseEvent, PosePoint } from '../../modules/fitaia-pose';
import { THRESH } from './repCounter';
import { toView } from './previewMap';
import { LIME } from '@/theme/tokens';

const ORANGE = '#FF9F43';

const BONES: [keyof NonNullable<PoseEvent['points']>, keyof NonNullable<PoseEvent['points']>][] = [
  ['shoulder', 'elbow'],
  ['elbow', 'wrist'],
  ['shoulder', 'hip'],
  ['hip', 'knee'],
  ['knee', 'ankle'],
];

/** Squelette détecté dessiné sur l'aperçu caméra : vert quand la personne est bien placée, orange sinon. */
export function PoseSkeleton({ pose, width, height, mirrored, good }: { pose: PoseEvent; width: number; height: number; mirrored: boolean; good: boolean }) {
  if (!pose.found || !pose.points) return null;
  const aspect = pose.aspect && pose.aspect > 0 ? pose.aspect : 0.5625;
  const pts = pose.points;
  const seen = (q: PosePoint) => q.c >= THRESH.minConfidence;
  const v = (q: PosePoint) => toView(q, aspect, width, height, mirrored);
  const color = good ? LIME : ORANGE;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <G stroke={color} strokeWidth={5} strokeLinecap="round">
        {BONES.filter(([a, b]) => seen(pts[a]) && seen(pts[b])).map(([a, b]) => {
          const p = v(pts[a]);
          const q = v(pts[b]);
          return <Line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
        })}
      </G>
      <G fill="#F5F4F1">
        {(Object.keys(pts) as (keyof typeof pts)[]).filter((k) => seen(pts[k])).map((k) => {
          const p = v(pts[k]);
          return <Circle key={k} cx={p.x} cy={p.y} r={5} />;
        })}
        {pose.nose && seen(pose.nose) ? <Circle cx={v(pose.nose).x} cy={v(pose.nose).y} r={8} /> : null}
      </G>
    </Svg>
  );
}
