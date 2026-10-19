/**
 * Une seule vérité pour l'équilibrage : la configuration TypeScript (règles PF, étapes, calendrier, récompenses,
 * catalogue, exclusions, migration) et les données insérées par la migration 0002 doivent être IDENTIQUES,
 * ainsi que les noms et paramètres des fonctions SQL appelées par l'adaptateur Supabase.
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs supabase/tests/seed_sync.test.ts
 */
import { readFileSync } from 'node:fs';
import { PHASE2_RPC } from '../../src/backend/supabase/rpc';
import { LEGACY_MIGRATION } from '../../src/economy/migration';
import { REWARD_DEFINITIONS } from '../../src/economy/rewardCatalog';
import { LEDGER_REASONS, SOURCE_TYPES, TRANSACTION_TYPES } from '../../src/economy/types';
import { COSMETIC_CATALOG, SLOT_EXCLUSIONS } from '../../src/inventory/cosmeticCatalog';
import { COSMETIC_CATEGORIES, RARITIES } from '../../src/inventory/types';
import { ALLOWED_ACTION_TYPES, PROGRESSION_CALENDAR, PROGRESSION_RULES, STAGES } from '../../src/progression/progressionRules';
import { runSuite } from '../../tests/helpers/check';

// Chemin relatif à la racine du dépôt (lancer depuis la racine), valable en strip-types comme après esbuild.
const sql = readFileSync('supabase/migrations/0002_progression_economy.sql', 'utf8');

/** Lignes « (…) » du VALUES qui suit `insert into public.<table>`. */
function insertedRows(table: string): string[][] {
  const start = sql.indexOf(`insert into public.${table} (`);
  if (start < 0) throw new Error('insertion absente : ' + table);
  const valuesAt = sql.indexOf('values', start);
  const end = sql.indexOf(';', valuesAt);
  const body = sql.slice(valuesAt + 'values'.length, end);
  const rows: string[][] = [];
  for (const m of body.matchAll(/\(((?:'[^']*'|[^()'])*)\)/g)) {
    rows.push([...m[1].matchAll(/'((?:[^']|'')*)'|([^,\s][^,]*)/g)].map((x) => (x[1] !== undefined ? x[1].replace(/''/g, "'") : x[2].trim())));
  }
  return rows;
}

/** Valeurs d'une contrainte `check (<col> in (…))` dans une définition de table. */
function checkList(column: string, table: string): string[] {
  const def = sql.slice(sql.indexOf(`create table public.${table} (`));
  const m = new RegExp(`${column}\\s+text[^\\n]*?check \\(${column} in \\(([^)]*)\\)\\)`).exec(def);
  if (!m) throw new Error(`contrainte absente : ${table}.${column}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const nullable = (v: string) => (v === 'null' ? null : v);
const sorted = (list: readonly string[]) => [...list].sort();

runSuite('synchronisation TypeScript ↔ SQL', async (t) => {
  t.equal(
    insertedRows('progression_rules').map(([action, points, cap, grant, dedupe, proof, enabled]) => ({ action, points: Number(points), cap: Number(cap), grant, dedupe, proof, enabled: enabled === 'true' })),
    Object.entries(PROGRESSION_RULES).map(([action, r]) => ({ action, points: r.points, cap: r.dailyCap, grant: r.grantMode, dedupe: r.dedupe, proof: r.proof, enabled: r.enabled })),
    'règles des PF identiques (points, plafonds, mode, idempotence, preuve)',
  );
  t.equal(sorted(checkList('action_type', 'progression_rules')), sorted(ALLOWED_ACTION_TYPES), 'liste blanche des actions identique (contrainte CHECK)');
  t.equal(
    insertedRows('progression_stages').map(([id, rank, min]) => ({ id, rank: Number(rank), minPoints: Number(min) })),
    STAGES.map((s) => ({ id: s.id, rank: s.rank, minPoints: s.minPoints })),
    'étapes du Parcours identiques (identifiants, rangs, seuils)',
  );
  const tz = /day_time_zone\s+text\s+not null default '([^']+)'/.exec(sql)?.[1];
  const anchor = /season_anchor_day\s+date\s+not null default date '([^']+)'/.exec(sql)?.[1];
  const length = Number(/season_length_days integer not null default (\d+)/.exec(sql)?.[1]);
  t.equal({ tz, anchor, length }, { tz: PROGRESSION_CALENDAR.timeZone, anchor: PROGRESSION_CALENDAR.seasonAnchorDay, length: PROGRESSION_CALENDAR.seasonLengthDays }, 'calendrier identique (fuseau, ancre et durée de saison)');
  const migration = {
    version: /legacy_migration_version\s+text\s+not null default '([^']+)'/.exec(sql)?.[1],
    creditsPerFitcoin: Number(/legacy_credits_per_fitcoin\s+integer not null default (\d+)/.exec(sql)?.[1]),
    maxOpeningFitcoins: Number(/legacy_max_opening_fitcoins integer not null default (\d+)/.exec(sql)?.[1]),
  };
  t.equal(migration, LEGACY_MIGRATION, 'paramètres de migration de l’ancienne monnaie identiques');

  t.equal(
    insertedRows('cosmetic_items').map(([id, name, category, rarity, assetReference, source, price, enabled, createdAt]) => ({
      id, name, category, rarity, assetReference, source, priceFitcoins: price === 'null' ? null : Number(price), enabled: enabled === 'true', createdAt: new Date(createdAt).toISOString(),
    })),
    COSMETIC_CATALOG.map((i) => ({ ...i })),
    'catalogue cosmétique identique (12 objets, tous les champs)',
  );
  t.equal(sorted(checkList('category', 'cosmetic_items')), sorted(COSMETIC_CATEGORIES), 'catégories identiques');
  t.equal(sorted(checkList('rarity', 'cosmetic_items')), sorted(RARITIES), 'raretés identiques');
  t.equal(
    sorted(insertedRows('cosmetic_slot_exclusions').map(([a, b]) => a + '>' + b)),
    sorted(Object.entries(SLOT_EXCLUSIONS).flatMap(([slot, list]) => (list ?? []).map((other) => slot + '>' + other))),
    'emplacements incompatibles identiques',
  );
  t.equal(
    insertedRows('reward_definitions').map(([id, type, amount, item, condition, repeatable, enabled]) => ({
      id, type, amount: Number(amount), ...(nullable(item) === null ? {} : { cosmeticItemId: item }), unlockCondition: JSON.parse(condition) as unknown, repeatable: repeatable === 'true', enabled: enabled === 'true',
    })),
    REWARD_DEFINITIONS.map((r) => ({ ...r })),
    'récompenses identiques (paliers 900 / 1 000 / 1 150 / 1 300 et récompense quotidienne)',
  );
  t.equal(sorted(checkList('type', 'economy_transactions')), sorted(TRANSACTION_TYPES), 'types de mouvement identiques');
  t.equal(sorted(checkList('reason', 'economy_transactions')), sorted(LEDGER_REASONS), 'motifs du registre identiques');
  t.equal(sorted(checkList('source_type', 'economy_transactions')), sorted(SOURCE_TYPES), 'types de source identiques');

  for (const { fn, params } of Object.values(PHASE2_RPC)) {
    const m = new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`).exec(sql);
    const declared = m ? m[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean) : null;
    if (!declared || declared.join(',') !== params.join(',')) throw new Error(`fonction ${fn} : paramètres ${String(declared)} ≠ ${params.join(',')}`);
  }
  t.ok(true, `les ${Object.keys(PHASE2_RPC).length} fonctions appelées par l’adaptateur existent avec les mêmes paramètres nommés`);
  const granted = /grant execute on function\s+([\s\S]*?)\s+to authenticated;/.exec(sql.slice(sql.lastIndexOf('-- Fonctions : par défaut')))?.[1] ?? '';
  t.equal(sorted([...granted.matchAll(/public\.(\w+)\(/g)].map((m) => m[1])), sorted(Object.values(PHASE2_RPC).map((r) => r.fn)), 'seules ces fonctions sont exécutables par un membre connecté');
  t.ok(
    sql.includes("format('pf:%s:%s:%s', me, p_action, v_source)") && sql.includes("format('pf:%s:%s:%s:%s', p_target, p_action, p_source_id, me)") &&
      sql.includes("'reward:' || me || ':' || r.id || coalesce(':' || v_period, '')") && sql.includes("'purchase:' || me || ':' || p_request_id") &&
      sql.includes("'refund:' || o.id") && sql.includes("'migration:' || s.legacy_migration_version || ':' || p_user"),
    'formats des clés d’idempotence identiques à src/platform/idempotency.ts',
  );
});
