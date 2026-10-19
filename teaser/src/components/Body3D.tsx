import React from 'react';
import {Img, staticFile} from 'remotion';
import {BODY_IMG} from '../theme';

type Props = {
  readonly src: string; // chemin relatif à public/
  readonly cx: number; // centre horizontal à l'écran
  readonly feetY: number; // position des pieds à l'écran
  readonly height: number; // hauteur de la boîte image (1620 px source)
  readonly style?: React.CSSProperties;
  readonly scale?: number;
  readonly filter?: string;
  readonly opacity?: number;
};

/** Rendu 3D plein pied (fond transparent), placé par les pieds. */
export const Body3D: React.FC<Props> = ({src, cx, feetY, height, style, scale = 1, filter, opacity = 1}) => {
  const w = (height * BODY_IMG.w) / BODY_IMG.h;
  const top = feetY - BODY_IMG.feet * height;
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top,
        width: w,
        height,
        scale: String(scale),
        transformOrigin: `50% ${BODY_IMG.feet * 100}%`,
        filter,
        opacity,
        ...style,
      }}
    />
  );
};
