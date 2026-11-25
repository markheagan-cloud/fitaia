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

export type Sfx = 'tap' | 'succes' | 'pieces' | 'erreur' | 'rep' | 'revelation';

const FILES: Record<Sfx | 'musique', number> = {
  tap: require('../../assets/sounds/tap.wav'),
  succes: require('../../assets/sounds/succes.wav'),
  pieces: require('../../assets/sounds/pieces.wav'),
  erreur: require('../../assets/sounds/erreur.wav'),
  rep: require('../../assets/sounds/rep.wav'),
  revelation: require('../../assets/sounds/revelation.wav'),
  musique: require('../../assets/sounds/musique.wav'),
};
const VOLUME: Record<Sfx, number> = { tap: 0.35, succes: 0.8, pieces: 0.7, erreur: 0.6, rep: 0.6, revelation: 0.9 };
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
  syncMusic();
}

export function speak(text: string) {
  if (!text || !useSound.getState().voice || Platform.OS === 'web') return;
  try {
    Speech.stop().catch(() => {});
    Speech.speak(text, { language: 'fr-FR', rate: 1.05, pitch: 1.0 });
  } catch {
    // idem
  }
}
