/**
 * Vibrations FITAIA : une seule porte d'entrée, qui respecte le réglage « Vibrations » de Mon perso (indépendant du
 * son) et ne fait rien sur le web. Intensité proportionnelle à l'importance : appui léger, validation, succès, exploit.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSound } from './sound';

export type Buzz = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'select';

export function buzz(kind: Buzz): void {
  if (Platform.OS === 'web' || !useSound.getState().haptics) return;
  const p =
    kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'warning' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    : kind === 'error' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    : kind === 'select' ? Haptics.selectionAsync()
    : Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}
