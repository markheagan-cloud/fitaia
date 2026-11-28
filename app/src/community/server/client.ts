/**
 * Client Supabase de la Communauté (serveur réel). Actif seulement si l'adresse et la clé publique du projet sont
 * fournies (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY) ; sinon l'app reste en mode
 * « local + démonstration » et le dit à l'écran.
 *
 * La clé « anon » est publique par conception : la sécurité vient des règles d'accès (RLS) et des déclencheurs du
 * serveur (supabase/migrations), jamais du téléphone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SERVER_ENABLED = /^https:\/\/.+/.test(URL_) && ANON.length > 20;

let client: SupabaseClient | null = null;

/** Client unique (session gardée sur le téléphone, rafraîchie automatiquement). */
export function sb(): SupabaseClient {
  if (!SERVER_ENABLED) throw new Error('serveur Communauté non configuré');
  if (!client) {
    client = createClient(URL_, ANON, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Pour les tests de bout en bout (Node) : un client indépendant par compte, sans stockage partagé. */
export function makeClient(url: string, anon: string, storage?: { getItem(k: string): Promise<string | null> | string | null; setItem(k: string, v: string): Promise<void> | void; removeItem(k: string): Promise<void> | void }): SupabaseClient {
  return createClient(url, anon, { auth: { storage, persistSession: !!storage, autoRefreshToken: false, detectSessionInUrl: false } });
}
