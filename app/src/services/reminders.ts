/**
 * Rappels quotidiens « mission » : notifications locales (programmées sur le téléphone, aucun serveur).
 * Deux par jour, à heure fixe. La personne peut refuser : rien n'est alors programmé, l'app marche pareil.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const MISSIONS: { hour: number; minute: number; title: string; body: string }[] = [
  { hour: 12, minute: 15, title: 'Mission du jour', body: 'Tes pompes t’attendent. Pas de code de triche : la caméra compte tout.' },
  { hour: 19, minute: 30, title: 'Mission en cours', body: 'Ton perso ne changera pas tout seul. Un défi, un repas scanné, et tu avances.' },
];

/** Demande l'autorisation puis (re)programme les deux rappels. Renvoie false si refusé ou indisponible. */
export async function scheduleDailyMissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const m of MISSIONS) {
      await Notifications.scheduleNotificationAsync({
        content: { title: m.title, body: m.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: m.hour, minute: m.minute },
      });
    }
    return true;
  } catch {
    return false;
  }
}
