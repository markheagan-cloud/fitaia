import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FitaiaTeaser} from './Teaser';
import {C} from './theme';

/**
 * Adaptation 16:9 (1920 x 1080) : le montage vertical au centre, pleine hauteur,
 * sur un fond constitué du même film agrandi, flouté et assombri (copie muette).
 */
export const FitaiaTeaserWide: React.FC = () => {
  const panelW = (1080 * 1080) / 1920; // 607,5 px
  const bgScale = 1920 / 1080;
  return (
    <AbsoluteFill style={{backgroundColor: C.night, overflow: 'hidden'}}>
      <AbsoluteFill style={{filter: 'blur(36px) brightness(0.42) saturate(1.15)'}}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: (1080 - 1920 * bgScale) / 2,
            width: 1080,
            height: 1920,
            scale: String(bgScale),
            transformOrigin: '0 0',
          }}
        >
          <FitaiaTeaser muted />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(8,8,10,0) 30%, rgba(8,8,10,0.55) 100%)'}} />
      <div
        style={{
          position: 'absolute',
          left: (1920 - panelW) / 2,
          top: 0,
          width: 1080,
          height: 1920,
          scale: String(1080 / 1920),
          transformOrigin: '0 0',
          overflow: 'hidden',
          boxShadow: '0 0 120px rgba(0,0,0,0.6)',
        }}
      >
        <FitaiaTeaser />
      </div>
      <div style={{position: 'absolute', left: (1920 - panelW) / 2 - 3, top: 0, width: 3, height: 1080, background: 'rgba(200,240,60,0.35)'}} />
      <div style={{position: 'absolute', left: (1920 + panelW) / 2, top: 0, width: 3, height: 1080, background: 'rgba(200,240,60,0.35)'}} />
    </AbsoluteFill>
  );
};
