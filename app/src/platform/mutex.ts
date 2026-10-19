/**
 * Verrou asynchrone par clé (une file par utilisateur) : dans le serveur local, deux opérations sur le même
 * utilisateur s'exécutent l'une après l'autre, comme un `SELECT … FOR UPDATE` sur la ligne du wallet en SQL.
 * Portée : un seul processus (l'app). Le vrai verrou multi-appareils est celui de PostgreSQL.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Nombre de clés ayant une opération en cours ou en attente (diagnostic et tests). */
  pendingKeys(): number {
    return this.tails.size;
  }
}
