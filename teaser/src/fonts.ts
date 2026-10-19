import {loadFont} from '@remotion/fonts';
import {loadFont as loadDMSans} from '@remotion/google-fonts/DMSans';
import {staticFile} from 'remotion';

// Archivo Expanded / SemiExpanded ExtraBold : polices de marque FITAIA (OFL), fichiers locaux dans public/fonts.
export const DISPLAY = 'FitaiaExpanded';
export const DISPLAY_SEMI = 'FitaiaSemiExpanded';

loadFont({family: DISPLAY, url: staticFile('fonts/ArchivoExpanded-ExtraBold.ttf'), weight: '800'});
loadFont({family: DISPLAY_SEMI, url: staticFile('fonts/ArchivoSemiExpanded-ExtraBold.ttf'), weight: '800'});

export const {fontFamily: BODY} = loadDMSans('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
});
