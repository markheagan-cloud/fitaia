/**
 * Achats (FIT Points, FITAIA Plus) via RevenueCat — chargé seulement si la clé est fournie ET si le module natif existe
 * (version compilée). Dans Expo Go / web : `available = false`, et l'app n'affiche JAMAIS un paiement simulé comme réel.
 * Règle Apple 3.1.1 : restauration des achats toujours proposée.
 */
import { Platform } from 'react-native';

export type Offer = { id: string; title: string; price: string; period: 'month' | 'year' | 'once'; perMonth?: string; savings?: string };

const KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

type RC = {
  configure: (o: { apiKey: string }) => void;
  getOfferings: () => Promise<{ current?: { availablePackages: { identifier: string; product: { title: string; priceString: string; identifier: string } }[] } | null }>;
  purchasePackage: (p: unknown) => Promise<{ customerInfo: { entitlements: { active: Record<string, unknown> } } }>;
  restorePurchases: () => Promise<{ entitlements: { active: Record<string, unknown> } }>;
};

let rc: RC | null = null;
let packages: Record<string, unknown> = {};

function load(): RC | null {
  if (rc) return rc;
  if (!KEY || Platform.OS === 'web') return null;
  try {
    // Chargement paresseux : absent dans Expo Go, présent après `eas build`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as { default: RC };
    rc = mod.default;
    rc.configure({ apiKey: KEY });
    return rc;
  } catch {
    return null;
  }
}

export const purchasesAvailable = (): boolean => load() !== null;

/** Offres réelles (prix App Store localisés). Vide si RevenueCat n'est pas configuré. */
export async function loadOffers(): Promise<Offer[]> {
  const sdk = load();
  if (!sdk) return [];
  const off = await sdk.getOfferings();
  const pk = off.current?.availablePackages ?? [];
  packages = {};
  return pk.map((p) => {
    packages[p.identifier] = p;
    const period: Offer['period'] = /annual|year/i.test(p.identifier) ? 'year' : /month/i.test(p.identifier) ? 'month' : 'once';
    return { id: p.identifier, title: p.product.title, price: p.product.priceString, period };
  });
}

export async function buy(id: string): Promise<boolean> {
  const sdk = load();
  if (!sdk || !packages[id]) return false;
  const r = await sdk.purchasePackage(packages[id]);
  return Boolean(r.customerInfo.entitlements.active.plus);
}

export async function restore(): Promise<boolean> {
  const sdk = load();
  if (!sdk) return false;
  const info = await sdk.restorePurchases();
  return Boolean(info.entitlements.active.plus);
}
