/**
 * Contrat de l'adaptateur SUPABASE contre un vrai PostgreSQL 16 : la même suite de conformité que le serveur local
 * (tests/conformance/phase2Conformance.ts) est rejouée à travers `createSupabaseRepositories`, dont le client RPC
 * passe ici par psql (une session par appel, rôle « authenticated », request.jwt.claim.sub = le membre).
 * Les appels concurrents de la suite sont donc de VRAIES sessions PostgreSQL parallèles.
 *
 *   node --experimental-strip-types --no-warnings --import ../ts-hook.mjs supabase/tests/repository_contract.test.ts
 * Variables : PGHOST (défaut /var/lib/postgresql/fitaia-test), PGPORT (54329), PGUSER (postgres).
 * Sans PostgreSQL joignable, le test ÉCHOUE (il n'est jamais déclaré réussi sans avoir tourné).
 */
import { execFile } from 'node:child_process';
import { createSupabaseRepositories } from '../../src/backend/supabase/SupabaseRepository';
import { decodeTransaction, decodeWallet } from '../../src/backend/supabase/decode';
import type { RpcClient, RpcResponse } from '../../src/backend/supabase/rpc';
import type { MigrationOutcome, RefundOutcome, RewardDefinition } from '../../src/economy/types';
import type { GrantOutcome } from '../../src/inventory/types';
import { createEventBus } from '../../src/platform/events';
import { uuidV4 } from '../../src/platform/ids';
import { TEST_REWARDS, runPhase2Conformance } from '../../tests/conformance/phase2Conformance';
import { runSuite } from '../../tests/helpers/check';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const PG = ['-h', env.PGHOST ?? '/var/lib/postgresql/fitaia-test', '-p', env.PGPORT ?? '54329', '-U', env.PGUSER ?? 'postgres'];
const DB = 'fitaia_p2_contract';

type PsqlResult = { code: number; stdout: string; stderr: string };

/** Exécute un script psql ; les valeurs passent par des variables psql (:'v0') : jamais concaténées dans le SQL. */
function psql(db: string, script: string, vars: Record<string, string> = {}, files: string[] = []): Promise<PsqlResult> {
  const args = [...PG, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', db];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  for (const f of files) args.push('-f', f);
  return new Promise((resolve) => {
    const child = execFile('psql', args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end(script);
  });
}

/** Appel `select public.<fn>(p => :'v0', …)` en tant que `role`. */
async function call(role: 'authenticated' | 'service_role', userId: string | null, fn: string, args: Record<string, unknown>): Promise<RpcResponse> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error('nom de fonction refusé');
  const vars: Record<string, string> = {};
  const named = Object.entries(args).map(([name, value], i) => {
    if (!/^p_[a-z_]+$/.test(name)) throw new Error('nom de paramètre refusé');
    if (value === null || value === undefined) return `${name} => null`;
    vars['v' + i] = String(value);
    return `${name} => :'v${i}'`;
  });
  const who = userId === null ? '' : `set request.jwt.claim.sub = '${userId.replace(/[^0-9a-f-]/g, '')}';\n`;
  const r = await psql(DB, `set role ${role};\n${who}select (public.${fn}(${named.join(', ')}))::text;\n`, vars);
  if (r.code !== 0) {
    const m = /ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(r.stderr);
    return { data: null, error: { message: m ? m[2] : r.stderr.trim(), code: m?.[1] } };
  }
  return { data: JSON.parse(r.stdout.trim()) as unknown, error: null };
}

const memberRpc = (userId: string): RpcClient => ({ rpc: (fn, args = {}) => call('authenticated', userId, fn, args) });

async function admin<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await call('service_role', null, fn, args);
  if (r.error) throw new Error(fn + ' : ' + r.error.message);
  return r.data as T;
}

/** Sorties des opérations serveur décodées avec les mêmes décodeurs stricts que l'adaptateur. */
function decodeAdmin(raw: { ok: boolean; code?: string; replayed?: boolean; transaction?: unknown; wallet?: unknown }) {
  return {
    ok: raw.ok,
    code: raw.code,
    replayed: raw.replayed ?? false,
    transaction: raw.transaction === null || raw.transaction === undefined ? null : decodeTransaction(raw.transaction),
    wallet: raw.wallet === undefined ? null : decodeWallet(raw.wallet),
  };
}

const rewardSql = (r: RewardDefinition) =>
  `('${r.id}', '${r.type}', ${r.amount}, ${r.cosmeticItemId ? `'${r.cosmeticItemId}'` : 'null'}, '${JSON.stringify(r.unlockCondition)}', ${r.repeatable}, ${r.enabled})`;

runSuite('contrat Supabase (PostgreSQL réel)', async (t) => {
  const ping = await psql('postgres', 'select 1;');
  if (ping.code !== 0) throw new Error('NON EXÉCUTÉ : PostgreSQL injoignable (' + ping.stderr.trim() + ')');
  const reset = await psql('postgres', `drop database if exists ${DB};\ncreate database ${DB};\n`);
  if (reset.code !== 0) throw new Error(reset.stderr);
  // Chemins relatifs à la racine du dépôt (lancer depuis la racine).
  const migrate = await psql(DB, '', {}, ['supabase/tests/supabase_stub.sql', 'supabase/migrations/0001_community.sql', 'supabase/migrations/0002_progression_economy.sql']);
  if (migrate.code !== 0) throw new Error('migrations : ' + migrate.stderr);
  const seed = await psql(DB, `insert into public.reward_definitions (id, type, amount, cosmetic_item_id, unlock_condition, repeatable, enabled) values\n${TEST_REWARDS.map(rewardSql).join(',\n')};\n`);
  if (seed.code !== 0) throw new Error('récompenses de test : ' + seed.stderr);
  t.ok(true, 'base neuve : bouchon Supabase + 0001 + 0002 appliqués, récompenses de test insérées');

  const events = createEventBus();
  await runPhase2Conformance(
    {
      name: 'supabase+pg16',
      events,
      async newUser() {
        const userId = uuidV4();
        const r = await psql(DB, `insert into auth.users values (:'u');\n`, { u: userId });
        if (r.code !== 0) throw new Error(r.stderr);
        return { userId, repos: createSupabaseRepositories({ rpc: memberRpc(userId), userId, events }) };
      },
      verifyLedger: async (userId) => (await admin<boolean>('verify_wallet_ledger', { p_user: userId })) === true,
      admin: {
        async refund(userId, transactionId) {
          const raw = decodeAdmin(await admin('admin_refund_fitcoins', { p_user: userId, p_transaction_id: transactionId, p_refund_reason: 'support' }));
          return (raw.ok && raw.transaction && raw.wallet
            ? { ok: true, replayed: raw.replayed, transaction: raw.transaction, wallet: raw.wallet }
            : { ok: false, code: raw.code }) as RefundOutcome;
        },
        async migrate(userId, legacyBalance) {
          const raw = decodeAdmin(await admin('admin_migrate_legacy_fitcoins', { p_user: userId, p_legacy_balance: legacyBalance }));
          return (raw.ok && raw.wallet ? { ok: true, replayed: raw.replayed, transaction: raw.transaction, wallet: raw.wallet } : { ok: false, code: raw.code }) as MigrationOutcome;
        },
        grant: (userId, itemId) => admin<GrantOutcome>('admin_grant_cosmetic', { p_user: userId, p_item_id: itemId }),
      },
    },
    t,
  );

  const anonymous = await call('authenticated', null, 'get_wallet', {});
  t.ok(anonymous.error?.code === '28000' && anonymous.data === null, 'session sans membre : erreur 28000 « non connecté », aucune donnée');
  const drop = await psql('postgres', `drop database ${DB};\n`);
  t.ok(drop.code === 0, 'base de test supprimée');
});
