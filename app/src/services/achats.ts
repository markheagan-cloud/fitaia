/**
 * Achats intégrés Apple (StoreKit, via expo-iap) : une tenue achetée en euros est débloquée tout de suite et reste à
 * la personne pour toujours (produit non consommable). Aucune monnaie achetable, aucun lot (décision du 26/11/2026).
 *
 * Disponible seulement dans une vraie build iPhone : sur le web et dans Expo Go le module natif n'existe pas, et
 * l'écran le dit (« achat en euros disponible sur l'app iPhone ») au lieu de faire semblant.
 *
 * Mode local (aujourd'hui) : l'achat validé par Apple débloque la tenue sur le téléphone. Avec le serveur réel, la
 * preuve d'achat devra être vérifiée côté serveur avant d'ajouter la tenue (même fonction grantCosmetic, côté admin).
 */
import { Platform } from 'react-native';
import { itemIdOfProduct, productIdOf } from '@/shop/prixEuros';

type Iap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;

let mod: Iap | null | undefined;
let connected: Promise<boolean> | null = null;

function iap(): Iap | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-iap') as Iap;
    mod.initConnection; // le module natif manque dans Expo Go : l'accès échoue ici, pas pendant l'achat
  } catch {
    mod = null;
  }
  return mod;
}

/** Vrai dans une build iPhone avec StoreKit ; faux sur le web et dans Expo Go. */
export const achatsPossibles = () => iap() !== null;

async function connect(m: Iap): Promise<boolean> {
  if (!connected) connected = m.initConnection().then(() => true, () => ((connected = null), false));
  return connected;
}

/** Prix affichés par Apple (devise et arrondis du pays de la personne), par identifiant de tenue. */
export async function prixApple(itemIds: string[]): Promise<Record<string, string>> {
  const m = iap();
  if (!m || !itemIds.length || !(await connect(m))) return {};
  try {
    const products = (await m.fetchProducts({ skus: itemIds.map(productIdOf), type: 'in-app' })) ?? [];
    const out: Record<string, string> = {};
    for (const p of products as { id: string; displayPrice?: string }[]) {
      const item = itemIdOfProduct(p.id);
      if (item && p.displayPrice) out[item] = p.displayPrice;
    }
    return out;
  } catch {
    return {};
  }
}

export type AchatResultat = { ok: true } | { ok: false; annule: boolean; message: string };

/**
 * Achète une tenue. `debloquer` est appelé une fois Apple d'accord ; la transaction n'est terminée qu'après, pour
 * qu'un achat payé ne soit jamais perdu (sinon StoreKit le représente au prochain lancement, voir reprendreAchats).
 */
export async function acheterEnEuros(itemId: string, debloquer: (itemId: string) => Promise<void>): Promise<AchatResultat> {
  const m = iap();
  if (!m) return { ok: false, annule: false, message: 'Achat en euros disponible sur l’app iPhone.' };
  if (!(await connect(m))) return { ok: false, annule: false, message: 'App Store injoignable. Réessaie dans un instant.' };
  const sku = productIdOf(itemId);
  return new Promise<AchatResultat>((resolve) => {
    let done = false;
    const finish = (r: AchatResultat) => {
      if (done) return;
      done = true;
      ok.remove();
      ko.remove();
      resolve(r);
    };
    const ok = m.purchaseUpdatedListener(async (p: Purchase) => {
      if (p.productId !== sku) return;
      try {
        await debloquer(itemId);
        await m.finishTransaction({ purchase: p, isConsumable: false });
        finish({ ok: true });
      } catch {
        finish({ ok: false, annule: false, message: 'Paiement reçu, tenue pas encore ajoutée : elle arrive au prochain lancement.' });
      }
    });
    const ko = m.purchaseErrorListener((e: { code?: string; message?: string }) => {
      const annule = e.code === 'user-cancelled';
      finish({ ok: false, annule, message: annule ? 'Achat annulé.' : 'Achat impossible : ' + (e.message || 'erreur App Store') + '.' });
    });
    m.requestPurchase({ request: { apple: { sku } }, type: 'in-app' }).catch((e: unknown) =>
      finish({ ok: false, annule: false, message: 'Achat impossible : ' + (e instanceof Error ? e.message : 'erreur App Store') + '.' }),
    );
  });
}

/**
 * « Restaurer mes achats » (obligatoire chez Apple) et reprise au lancement : chaque tenue déjà payée sur ce
 * compte Apple est redébloquée. Renvoie les identifiants de tenue retrouvés.
 */
export async function reprendreAchats(debloquer: (itemId: string) => Promise<void>, depuisApple = false): Promise<string[]> {
  const m = iap();
  if (!m || !(await connect(m))) return [];
  try {
    if (depuisApple) await m.restorePurchases();
    const found: string[] = [];
    for (const p of (await m.getAvailablePurchases()) ?? []) {
      const item = itemIdOfProduct(p.productId);
      if (!item || found.includes(item)) continue;
      await debloquer(item);
      await m.finishTransaction({ purchase: p, isConsumable: false }).catch(() => undefined);
      found.push(item);
    }
    return found;
  } catch {
    return [];
  }
}
