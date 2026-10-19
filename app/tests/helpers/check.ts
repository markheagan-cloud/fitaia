/**
 * Mini-harnais de test sans dépendance (Node ≥ 22 en mode strip-types, ou esbuild) : chaque vérification est
 * comptée et affichée ; le premier échec interrompt la suite avec un code de sortie non nul.
 */
export type Check = {
  ok(condition: boolean, label: string): void;
  equal(actual: unknown, expected: unknown, label: string): void;
  count(): number;
};

/** JSON stable (clés triées) pour comparer des structures. */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export function createCheck(prefix = ''): Check {
  let n = 0;
  return {
    ok(condition, label) {
      if (!condition) throw new Error('ÉCHEC : ' + prefix + label);
      n++;
      console.log('ok ' + prefix + label);
    },
    equal(actual, expected, label) {
      const a = stable(actual);
      const e = stable(expected);
      if (a !== e) throw new Error('ÉCHEC : ' + prefix + label + '\n  obtenu  : ' + a + '\n  attendu : ' + e);
      n++;
      console.log('ok ' + prefix + label);
    },
    count: () => n,
  };
}

/** Lance une suite asynchrone ; un échec rejette la promesse (sortie en erreur de Node). */
export function runSuite(title: string, body: (t: Check) => Promise<void>): void {
  const t = createCheck();
  body(t).then(
    () => console.log(`\n${t.count()} tests ${title} OK`),
    (error: unknown) => {
      console.error(error);
      throw error;
    },
  );
}

/** Horloge de test réglable. */
export function testClock(iso: string): { now(): Date; set(iso: string): void; advanceDays(days: number): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current.getTime()),
    set(next) {
      current = new Date(next);
    },
    advanceDays(days) {
      current = new Date(current.getTime() + days * 86_400_000);
    },
  };
}

/** Identifiants de test déterministes (UUID v4 bien formés). */
export function sequentialIds(seed = 1): { next(): string } {
  let i = seed;
  return {
    next() {
      const hex = (i++).toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}`;
    },
  };
}
