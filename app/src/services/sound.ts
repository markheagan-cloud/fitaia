/**
 * Le son de FITAIA : musique de fond discrète, bruitages et voix qui compte les répétitions.
 * Tous les sons sont originaux, synthétisés par scripts/make-sounds.py (aucun échantillon tiers, aucune licence).
 * La voix est la synthèse vocale du téléphone (expo-speech), en français.
 *
 * Règles « intelligentes » :
 *  - on se mélange à ce que l'utilisateur écoute déjà (sa musique, un podcast) sans jamais le couper ;
 *  - le bouton silencieux de l'iPhone coupe musique et bruitages ;
 *  - la musique s'efface pendant un défi pour laisser la voix, et revient après ;
 *  - trois interrupteurs dans « Mon perso » : musique, bruitages, voix (mémorisés).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { placeOf, type Place } from './placeSound';
import { pickVoice } from './voicePick';

export type Sfx = 'tap' | 'succes' | 'pieces' | 'erreur' | 'rep' | 'revelation' | 'achat' | 'message' | `lieu_${Place}`;

const FILES: Record<Sfx | 'musique', number> = {
  tap: require('../../assets/sounds/tap.wav'),
  succes: require('../../assets/sounds/succes.wav'),
  pieces: require('../../assets/sounds/pieces.wav'),
  erreur: require('../../assets/sounds/erreur.wav'),
  rep: require('../../assets/sounds/rep.wav'),
  revelation: require('../../assets/sounds/revelation.wav'),
  achat: require('../../assets/sounds/achat.wav'),
  message: require('../../assets/sounds/message.wav'),
  lieu_accueil: require('../../assets/sounds/lieu_accueil.wav'),
  lieu_defis: require('../../assets/sounds/lieu_defis.wav'),
  lieu_scan: require('../../assets/sounds/lieu_scan.wav'),
  lieu_boutique: require('../../assets/sounds/lieu_boutique.wav'),
  lieu_perso: require('../../assets/sounds/lieu_perso.wav'),
  lieu_communaute: require('../../assets/sounds/lieu_communaute.wav'),
  musique: require('../../assets/sounds/musique.wav'),
};
const VOLUME: Record<Sfx, number> = { tap: 0.35, succes: 0.8, pieces: 0.7, erreur: 0.6, rep: 0.6, revelation: 0.9, achat: 0.9, message: 0.5,
  lieu_accueil: 0.4, lieu_defis: 0.45, lieu_scan: 0.4, lieu_boutique: 0.45, lieu_perso: 0.4, lieu_communaute: 0.45,
};
const MUSIC_VOLUME = 0.22;

type SoundPrefs = { music: boolean; sfx: boolean; voice: boolean; set: (k: 'music' | 'sfx' | 'voice', v: boolean) => void };
export const useSound = create<SoundPrefs>()(
  persist(
    (set) => ({ music: true, sfx: true, voice: true, set: (k, v) => { set({ [k]: v } as Partial<SoundPrefs>); syncMusic(); } }),
    { name: 'fitaia-son', storage: createJSONStorage(() => AsyncStorage), onRehydrateStorage: () => () => syncMusic() },
  ),
);

const players: Partial<Record<Sfx, AudioPlayer>> = {};
let music: AudioPlayer | null = null;
let ready = false;
let focus = false; // vrai pendant un défi : la musique se tait

function init() {
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

export function playSfx(name: Sfx) {
  if (!useSound.getState().sfx) return;
  try {
    init();
    const p = (players[name] ??= createAudioPlayer(FILES[name]));
    p.volume = VOLUME[name];
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // le son n'est jamais bloquant
  }
}

let lastPlace: Place | null = null;
/** Un son par endroit : joué quand on ENTRE dans un lieu (pas à chaque écran du même lieu, ni au lancement). */
export function enterPlace(pathname: string) {
  const place = placeOf(pathname);
  if (!place || place === lastPlace) return;
  const first = lastPlace === null;
  lastPlace = place;
  if (!first) playSfx(`lieu_${place}`);
}

function syncMusic() {
  try {
    const want = useSound.getState().music && !focus;
    if (want) {
      init();
      if (!music) {
        music = createAudioPlayer(FILES.musique);
        music.loop = true;
        music.volume = MUSIC_VOLUME;
      }
      music.play();
    } else {
      music?.pause();
    }
  } catch {
    // idem
  }
}
/** À appeler une fois l'app affichée. */
export const startMusic = syncMusic;
/** Début / fin d'un défi : la musique laisse la place à la voix. */
export function setFocus(on: boolean) {
  focus = on;
  // Pendant un défi, la voix du coach doit s'entendre même si l'iPhone est en mode silencieux (sinon iOS la coupe
  // et la personne, au sol, n'a aucune indication) ; la musique d'une autre app baisse le temps de la phrase.
  try {
    ready = true;
    setAudioModeAsync(on ? { playsInSilentMode: true, interruptionMode: 'duckOthers' } : { playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  } catch {
    // le son n'est jamais bloquant
  }
  syncMusic();
}

let voiceId: string | undefined;
let voicePicked = false;

function loadVoice() {
  if (voicePicked) return;
  voicePicked = true;
  Speech.getAvailableVoicesAsync()
    .then((v) => { voiceId = pickVoice(v); })
    .catch(() => {});
}

/**
 * Fait parler le coach. `now` (défaut) coupe la phrase en cours : pour le comptage, qui doit tomber pile sur la pompe.
 * `queue` attend la fin de la phrase en cours : pour les consignes, qui ne doivent pas couper un chiffre.
 */
export function speak(text: string, mode: 'now' | 'queue' = 'now') {
  if (!text || !useSound.getState().voice || Platform.OS === 'web') return;
  try {
    loadVoice();
    if (mode === 'now') Speech.stop().catch(() => {});
    Speech.speak(text, { language: 'fr-FR', voice: voiceId, rate: 1.0, pitch: 1.0 });
  } catch {
    // idem
  }
}

/** À appeler à l'ouverture d'un défi : la liste des voix est prête avant la première phrase. */
export const prepareVoice = loadVoice;
