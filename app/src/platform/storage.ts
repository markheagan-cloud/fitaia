/**
 * Stockage clé-valeur asynchrone. Même forme que AsyncStorage (getItem / setItem / removeItem) : l'app pourra
 * brancher AsyncStorage tel quel pour le mode local ; les tests utilisent la mémoire.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMemoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    async getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}
