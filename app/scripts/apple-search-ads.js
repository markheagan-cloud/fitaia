#!/usr/bin/env node
/**
 * FITAIA — Apple Search Ads : plan de campagne (préparation uniquement, AUCUNE action réelle)
 * Entrée : store/asa-seed.json (tes mots-clés). Sortie : store/asa-plan.md + CSV importable dans ASA.
 * Les volumes/CPT réels ne sont PAS estimés ici : ils viennent d'ASA une fois le compte créé.
 */
const fs = require('fs');
const seed = JSON.parse(fs.readFileSync('store/asa-seed.json', 'utf8'));
const groups = { brand: [], generic: [], competitor: [], discovery: [] };
for (const k of seed.keywords) {
  const t = k.toLowerCase();
  if (seed.brand.some(b => t.includes(b))) groups.brand.push(t);
  else if (seed.competitors.some(c => t.includes(c))) groups.competitor.push(t);
  else if (t.split(' ').length >= 3) groups.discovery.push(t);
  else groups.generic.push(t);
}
const camp = [
  ['FITAIA – Brand', 'exact', groups.brand, 'Protéger la marque, CPT bas'],
  ['FITAIA – Generic Exact', 'exact', groups.generic, 'Intention forte : fitness, défi, calories…'],
  ['FITAIA – Competitor', 'exact', groups.competitor, 'Conquête – surveiller le CPT, enchère prudente'],
  ['FITAIA – Discovery', 'broad', groups.discovery.concat(groups.generic.slice(0, 5)), 'Search Match ON, broad : découverte de requêtes'],
];
let md = `# Plan Apple Search Ads — FITAIA\n\n> Préparation uniquement. Rien n’est créé ni dépensé. Budgets à valider par toi dans ASA.\n\n`;
let csv = 'Campaign,Ad Group,Keyword,Match Type\n';
for (const [name, match, kws, note] of camp) {
  md += `## ${name}\n- Match : **${match}**\n- Objectif : ${note}\n- Mots-clés (${kws.length}) : ${kws.join(', ') || '_à compléter_'}\n\n`;
  kws.forEach(k => { csv += `"${name}","${name.split('–')[1].trim()}","${k}",${match}\n`; });
}
md += `## Négatifs (toutes campagnes)\n${seed.negatives.map(n => `- ${n}`).join('\n')}\n\n## Custom Product Pages suggérées\n- "Défis" → capture caméra + validation IA (pour requêtes défi/pompes)\n- "Nutrition" → scanner repas (pour requêtes calories/nutrition)\n\n## Avant lancement\n- [ ] App publiée sur l’App Store\n- [ ] Compte ASA créé + budget quotidien validé par toi\n- [ ] Discovery : exporter les termes de recherche chaque semaine → promouvoir en exact, bloquer en négatif\n`;
fs.writeFileSync('store/asa-plan.md', md); fs.writeFileSync('store/asa-keywords.csv', csv);
console.log(md); console.log('→ store/asa-plan.md, store/asa-keywords.csv générés (aucune campagne créée)');
