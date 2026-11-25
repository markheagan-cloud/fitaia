/**
 * Rappels quotidiens « mission » : notifications locales (programmées sur le téléphone, aucun serveur).
 * Deux par jour, à heure fixe. La personne peut refuser : rien n'est alors programmé, l'app marche pareil.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const MISSIONS: { hour: number; minute: number; title: string; body: string }[] = [
  { hour: 12, minute: 15, title: 'Fenêtre d’entraînement ouverte', body: 'Tes pompes t’attendent. Pas de code de triche : la caméra compte tout.' },
  { hour: 19, minute: 30, title: 'Ta fenêtre se ferme à minuit', body: 'Force, Carburant, Régularité : un défi et un repas noté, et tes niveaux montent.' },
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
