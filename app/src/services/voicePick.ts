/** Voix la plus naturelle installée sur l'iPhone : française de France, « améliorée » si possible, jamais une voix fantaisie. */
export function pickVoice(voices: { identifier: string; name: string; quality: string; language: string }[]): string | undefined {
  const novelty = /eloquence|speech\.synthesis/i; // voix fantaisie d'iOS (Grandma, Rocko, Albert…)
  const fr = voices.filter((v) => /^fr[-_]FR$/i.test(v.language) && !novelty.test(v.identifier));
  const score = (v: { identifier: string; name: string; quality: string }) =>
    (/premium/i.test(v.identifier) ? 4 : 0) + (v.quality === 'Enhanced' ? 3 : 0) + (/siri/i.test(v.identifier) ? 1 : 0) + (/thomas|audrey|aur[eé]lie|am[eé]lie|marie/i.test(v.name) ? 1 : 0);
  return fr.sort((a, b) => score(b) - score(a))[0]?.identifier;
}
