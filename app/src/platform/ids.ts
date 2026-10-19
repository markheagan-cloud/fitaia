/** Générateur d'identifiants injectable (UUID v4). */
export type IdGenerator = { next(): string };

type CryptoLike = { randomUUID?: () => string; getRandomValues?: <T extends Uint8Array>(array: T) => T };

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(bytes);
  // Hermes sans polyfill : identifiants du mode local uniquement (le serveur réel utilise gen_random_uuid()).
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function uuidV4(): string {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = randomBytes();
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const uuidGenerator: IdGenerator = { next: uuidV4 };
