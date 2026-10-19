import React from 'react';
import {AbsoluteFill} from 'remotion';
import './fonts';
import {Body3D} from './components/Body3D';
import {Logo} from './components/Logo';
import {Grain, Vignette} from './components/Fx';
import {BODY, DISPLAY} from './fonts';
import {C} from './theme';

/** Affiche (image fixe 1080 x 1920) pour la vignette / la publication. */
export const Poster: React.FC = () => (
  <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 55% at 50% 50%, #2A2C2F 0%, #121315 58%, #09090A 100%)', overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: 540 - 440, top: 1640 - 75, width: 880, height: 150, background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(200,240,60,0.4) 0%, rgba(200,240,60,0) 70%)'}} />
    <Body3D src="3d/morphp_00.png" cx={540} feetY={1640} height={1300} filter="brightness(0) invert(1)" opacity={0.1} />
    <Body3D src="3d/morphp_24.png" cx={540} feetY={1640} height={1300} />
    <div style={{position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, lineHeight: 0.98, letterSpacing: '-0.02em', color: C.white}}>
      TON CORPS ÉVOLUE.
      <br />
      <span style={{color: C.lime}}>TON AVATAR AUSSI.</span>
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26}}>
      <Logo size={96} />
      <div style={{fontFamily: DISPLAY, fontWeight: 800, fontSize: 76, color: C.white, letterSpacing: '0.04em'}}>FITAIA</div>
    </div>
    <div style={{position: 'absolute', left: 0, right: 0, top: 1826, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 32, letterSpacing: '0.22em', color: '#A9A7A2'}}>
      BIENTÔT SUR IPHONE ET ANDROID
    </div>
    <Vignette strength={0.35} />
    <Grain opacity={0.06} />
  </AbsoluteFill>
);
