/**
 * Chemins de la Communauté (pile expo-router `app/communaute/*`).
 * Les types de routes générés par Expo (.expo/types) ne sont recalculés qu'au prochain `expo start` :
 * on passe donc par une conversion explicite pour garder la vérification TypeScript propre en attendant.
 */
import type { Href } from 'expo-router';

const href = (p: string) => p as Href;

export const CR = {
  home: href('/communaute'),
  fitmatch: href('/communaute/fitmatch'),
  /** FitMatch adapté au besoin du jour (coup de pouce). */
  fitmatchFor: (need: string) => href('/communaute/fitmatch?besoin=' + encodeURIComponent(need)),
  boost: href('/communaute/coup-de-pouce'),
  messages: href('/communaute/messages'),
  privacy: href('/communaute/confidentialite'),
  tabs: href('/(tabs)'),
  profile: (id: string) => href('/communaute/profil/' + encodeURIComponent(id)),
  chat: (id: string) => href('/communaute/discussion/' + encodeURIComponent(id)),
};
