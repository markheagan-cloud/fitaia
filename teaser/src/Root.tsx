import React from 'react';
import {Composition, Folder, Still} from 'remotion';
import './fonts';
import {FitaiaTeaser} from './Teaser';
import {FitaiaTeaserWide} from './TeaserWide';
import {Poster} from './Poster';
import {SHook, SSeul, STurn} from './scenes/Act1';
import {SEvolve, SScan, SSpin, STrio} from './scenes/Act2Avatar';
import {SApp, SMeal, SPushups} from './scenes/Act2App';
import {SBuild, SChat, SMatch, SPayoff, SWall} from './scenes/Act3Community';
import {SAvatarAussi, SCorps, SEnd, SHistoire} from './scenes/Act4Climax';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="FitaiaTeaser" component={FitaiaTeaser} durationInFrames={1260} fps={30} width={1080} height={1920} defaultProps={{muted: false}} />
      <Composition id="FitaiaTeaserWide" component={FitaiaTeaserWide} durationInFrames={1260} fps={30} width={1920} height={1080} />
      <Still id="Poster" component={Poster} width={1080} height={1920} />
      <Folder name="Scenes">
        <Composition id="S01-Accroche" component={SHook} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S02-Seul" component={SSeul} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S03-Bascule" component={STurn} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S04-Scan" component={SScan} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S05-Rotation" component={SSpin} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S06-Evolution" component={SEvolve} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S07-Triptyque" component={STrio} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S08-App" component={SApp} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S09-Pompes" component={SPushups} durationInFrames={90} fps={30} width={1080} height={1920} />
        <Composition id="S10-Repas" component={SMeal} durationInFrames={30} fps={30} width={1080} height={1920} />
        <Composition id="S11-Communaute" component={SWall} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S12-FitMatch" component={SMatch} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S13-FitMates" component={SChat} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S14-PlusSeul" component={SPayoff} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S15-Montee" component={SBuild} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S16-Corps" component={SCorps} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S17-Avatar" component={SAvatarAussi} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S18-Histoire" component={SHistoire} durationInFrames={60} fps={30} width={1080} height={1920} />
        <Composition id="S19-Fin" component={SEnd} durationInFrames={180} fps={30} width={1080} height={1920} />
      </Folder>
    </>
  );
};
