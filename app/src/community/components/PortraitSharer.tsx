/**
 * Serveur réel : envoie aux autres membres l'image de MON perso (le même qu'à l'Accueil), dès que la Communauté est
 * rejointe et à chaque changement de perso. Le selfie d'origine ne part jamais : seulement le dessin affiché.
 * Sans effet en mode démonstration.
 */
import { useEffect } from 'react';
import { Asset } from 'expo-asset';
import { COMMUNITY_MODE, useCommunity } from '../store';
import { useMySharedPortrait } from './AvatarPortrait';

export function PortraitSharer() {
  const status = useCommunity((s) => s.status);
  const hydrated = useCommunity((s) => s.hydrated);
  const spec = useMySharedPortrait();
  const src = spec.source as unknown;
  const ref = typeof src === 'number' ? 'asset:' + src : (src as { uri?: string })?.uri ?? '';
  const key = spec.frame + '|' + ref + '|' + (spec.head ? [spec.head.cx, spec.head.cy, spec.head.h].join(',') : '');
  useEffect(() => {
    if (COMMUNITY_MODE !== 'serveur' || !hydrated || status !== 'active' || !ref) return;
    if (useCommunity.getState().sharedPortraitKey === key) return;
    let cancelled = false;
    (async () => {
      let uri = '';
      try {
        if (typeof src === 'number') {
          const a = Asset.fromModule(src);
          uri = a.localUri ?? a.uri;
        } else uri = (src as { uri?: string }).uri ?? '';
      } catch {
        return;
      }
      if (!cancelled && uri) useCommunity.getState().sharePortrait(key, uri, spec.frame, spec.head);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, status, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
