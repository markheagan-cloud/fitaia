/**
 * Petits correctifs d'environnement pour three.js dans React Native (Hermes). Sans effet dans un navigateur.
 *  - navigator.userAgent : le GLTFLoader de three lit navigator.userAgent.match(...) ; sous React Native il est
 *    indéfini, ce qui ferait planter le chargement.
 *  - TextDecoder : utilisé par le GLTFLoader pour lire l'en-tête JSON d'un GLB ; ajouté seulement s'il manque.
 */
type G = {
  navigator?: { userAgent?: unknown; product?: string };
  TextDecoder?: unknown;
};

function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp = (((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

class MiniTextDecoder {
  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return '';
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return utf8Decode(bytes);
  }
}

let done = false;

export function installThreePolyfills() {
  if (done) return;
  done = true;
  const g = globalThis as unknown as G;
  try {
    if (g.navigator && typeof g.navigator.userAgent !== 'string') {
      Object.defineProperty(g.navigator, 'userAgent', { value: 'ReactNative', configurable: true });
    }
  } catch {
    // navigator figé : rien à faire, le chargement tentera quand même
  }
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = MiniTextDecoder;
}
