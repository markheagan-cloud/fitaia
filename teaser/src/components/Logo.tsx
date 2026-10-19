import React from 'react';
import {C} from '../theme';

// Logo FITAIA redessiné en vecteur d'après assets/icon-source.png (1024 px) : arc « jauge » + F.
const R = 352.5;
const ARC_LEN = (R * 262.8 * Math.PI) / 180;

export const Logo: React.FC<{
  readonly size: number;
  readonly draw?: number; // 0 → 1 : tracé de l'arc
  readonly fScale?: number;
  readonly fOpacity?: number;
  readonly color?: string;
  readonly style?: React.CSSProperties;
}> = ({size, draw = 1, fScale = 1, fOpacity = 1, color = C.lime, style}) => (
  <svg width={size} height={size} viewBox="0 0 1024 1024" style={style}>
    <path
      d="M 247.5 745 A 352.5 352.5 0 1 1 776.5 745"
      fill="none"
      stroke={color}
      strokeWidth={95}
      strokeLinecap="butt"
      strokeDasharray={ARC_LEN}
      strokeDashoffset={ARC_LEN * (1 - draw)}
    />
    <g style={{transformOrigin: '512px 524px', scale: String(fScale), opacity: fOpacity}}>
      <rect x={403} y={364} width={81} height={320} fill={color} />
      <rect x={403} y={364} width={221} height={62} fill={color} />
      <rect x={403} y={486} width={213} height={62} fill={color} />
    </g>
  </svg>
);
