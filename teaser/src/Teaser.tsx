import React from 'react';
import {AbsoluteFill, staticFile, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {TransitionSeries} from '@remotion/transitions';
import './fonts';
import {Flash, Grain, LightLeak, Vignette} from './components/Fx';
import {SHook, SSeul, STurn} from './scenes/Act1';
import {SEvolve, SScan, SSpin, STrio} from './scenes/Act2Avatar';
import {SApp, SMeal, SPushups} from './scenes/Act2App';
import {SBuild, SChat, SMatch, SPayoff, SWall} from './scenes/Act3Community';
import {SAvatarAussi, SCorps, SEnd, SHistoire} from './scenes/Act4Climax';
import {C} from './theme';

/**
 * FITAIA — teaser vertical 1080 x 1920, 30 i/s, 42 s.
 * Montage cut sur la grille 120 BPM (1 temps = 15 images) de la musique originale public/fitaia-teaser-music.wav.
 * Les scènes s'enchaînent en coupes franches ; flashs et fuites de lumière sont des « overlays » posés sur les coupes
 * (ils ne raccourcissent pas la timeline, donc chaque coupe reste exactement sur le temps).
 */
export const FitaiaTeaser: React.FC<{readonly muted?: boolean}> = ({muted = false}) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: C.night}}>
      <TransitionSeries name="Montage">
        {/* ACTE 1 — seul */}
        <TransitionSeries.Sequence name="01 Accroche « Lundi. »" durationInFrames={60} premountFor={fps}>
          <SHook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="02 « Tu changes seul. »" durationInFrames={60} premountFor={fps}>
          <SSeul />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="03 « Et si ton double… »" durationInFrames={60} premountFor={fps}>
          <STurn />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={10} offset={5} premountFor={fps}>
          <Flash color={C.white} peak={1} />
        </TransitionSeries.Overlay>
        {/* ACTE 2 — l'avatar */}
        <TransitionSeries.Sequence name="04 Scan du visage" durationInFrames={60} premountFor={fps}>
          <SScan />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={6} offset={3} premountFor={fps}>
          <Flash color={C.lime} peak={0.8} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="05 Rotation « Il te ressemble »" durationInFrames={60} premountFor={fps}>
          <SSpin />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={6} offset={3} premountFor={fps}>
          <Flash color={C.white} peak={0.9} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="06 Évolution du corps" durationInFrames={60} premountFor={fps}>
          <SEvolve />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={4} offset={2} premountFor={fps}>
          <Flash color={C.white} peak={0.8} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="07 Triptyque « Où tu vas »" durationInFrames={60} premountFor={fps}>
          <STrio />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={24} premountFor={fps}>
          <LightLeak tint="lime" peak={0.9} />
        </TransitionSeries.Overlay>
        {/* les outils */}
        <TransitionSeries.Sequence name="08 Accueil de l'app" durationInFrames={60} premountFor={fps}>
          <SApp />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={4} offset={2} premountFor={fps}>
          <Flash color={C.white} peak={0.8} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="09 Pompes comptées" durationInFrames={90} premountFor={fps}>
          <SPushups />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="10 Repas scanné" durationInFrames={30} premountFor={fps}>
          <SMeal />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={24} premountFor={fps}>
          <LightLeak tint="lime" peak={0.7} />
        </TransitionSeries.Overlay>
        {/* la communauté */}
        <TransitionSeries.Sequence name="11 Mur de la communauté" durationInFrames={60} premountFor={fps}>
          <SWall />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={4} offset={2} premountFor={fps}>
          <Flash color={C.white} peak={0.8} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="12 FitMatch" durationInFrames={60} premountFor={fps}>
          <SMatch />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="13 FitMates : conversation" durationInFrames={60} premountFor={fps}>
          <SChat />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={8} offset={4} premountFor={fps}>
          <Flash color={C.white} peak={0.95} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="14 « Tu ne changes plus seul. »" durationInFrames={60} premountFor={fps}>
          <SPayoff />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="15 Montée" durationInFrames={60} premountFor={fps}>
          <SBuild />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={12} offset={6} premountFor={fps}>
          <Flash color={C.white} peak={1} />
        </TransitionSeries.Overlay>
        {/* ACTE 3 — climax */}
        <TransitionSeries.Sequence name="16 « Ton corps évolue. »" durationInFrames={60} premountFor={fps}>
          <SCorps />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={6} offset={3} premountFor={fps}>
          <Flash color={C.lime} peak={0.85} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="17 « Ton avatar aussi. »" durationInFrames={60} premountFor={fps}>
          <SAvatarAussi />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={6} offset={3} premountFor={fps}>
          <Flash color={C.white} peak={0.9} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="18 « Ton histoire reste. »" durationInFrames={60} premountFor={fps}>
          <SHistoire />
        </TransitionSeries.Sequence>
        <TransitionSeries.Overlay durationInFrames={14} offset={7} premountFor={fps}>
          <Flash color={C.white} peak={1} />
        </TransitionSeries.Overlay>
        <TransitionSeries.Sequence name="19 Logo + bientôt disponible" durationInFrames={180} premountFor={fps}>
          <SEnd />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Vignette strength={0.38} />
      <Grain opacity={0.08} />
      {muted ? null : <Audio name="Musique originale (120 BPM)" src={staticFile('fitaia-teaser-music.wav')} premountFor={fps} />}
    </AbsoluteFill>
  );
};
