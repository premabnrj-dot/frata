// =============================================================================
// FILE: e2e/stack.mjs
//
// THE LOCAL STACK for end-to-end flows: a throwaway Postgres (fresh database
// every run, every migration, e2e/seed.sql), the fake Supabase auth and fake
// Razorpay, and a production build started on PORTS.app. Never touches
// Supabase or any non-local database: E2E_ADMIN_URL (CI's service Postgres)
// must point at localhost, or the run refuses (it sets role passwords, which
// are server-wide). The app's and Admin's passwords are made up per run and
// never printed.
// =============================================================================
import { execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { BILLING_KEYS, CONSOLE, META, MUX, OUT, PORTS, SHOP_DOMAIN, adminSql, until } from './lib.mjs'
import { EKCODE } from './constants.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const PG_DIR = '/var/tmp/frata-e2e', PG_BIN = '/usr/lib/postgresql/16/bin', DB = 'frata_e2e'
// 64 MB of output: execSync's 1 MB default kills a build that prints more, with no reason given.
const sh = (cmd, env = {}) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } }).toString()
const asPg = (cmd) => sh(`su postgres -c "${cmd}"`)

const PUBLIC_ENV = {
  NEXT_PUBLIC_SHOP_DOMAIN: SHOP_DOMAIN, NEXT_PUBLIC_CONSOLE_HOST: 'localhost',
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORTS.auth}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon',
  NEXT_PUBLIC_META_APP_ID: META.appId, NEXT_PUBLIC_WA_CONFIG_ID: META.configId,
  NEXT_PUBLIC_EKCODE_HOST: EKCODE.host,
}

function startPostgres() {
  if (!existsSync(`${PG_DIR}/data/PG_VERSION`)) {
    mkdirSync(PG_DIR, { recursive: true }); sh(`chown postgres ${PG_DIR}`)
    asPg(`${PG_BIN}/initdb -D ${PG_DIR}/data -A trust -U postgres`)
  }
  try { asPg(`${PG_BIN}/pg_ctl -D ${PG_DIR}/data status`) } catch {
    asPg(`${PG_BIN}/pg_ctl -D ${PG_DIR}/data -o '-p ${PORTS.pg} -k ${PG_DIR}' -l ${PG_DIR}/log -w start`)
  }
  return `postgres://postgres@localhost:${PORTS.pg}`
}

const children = []
function run(name, cmd, args, env) {
  const log = openSync(`${OUT}${name}.log`, 'w')
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', log, log], detached: true })
  children.push(p); return p
}

export async function up({ build = true } = {}) {
  mkdirSync(OUT, { recursive: true })
  // A stack left by an earlier run (killed, or still shutting down) holds the ports: clear it first.
  try { sh(`pkill -f "next start -p ${PORTS.app}|e2e/fakes/" || true`) } catch {}
  await until(async () => { try { await fetch(CONSOLE); return false } catch { return true } }, 10_000)
  if (process.env.E2E_ADMIN_URL && !['localhost', '127.0.0.1'].includes(new URL(process.env.E2E_ADMIN_URL).hostname)) {
    throw new Error('E2E_ADMIN_URL must be a local Postgres (localhost or 127.0.0.1): the stack sets role passwords server-wide')
  }
  const server = process.env.E2E_ADMIN_URL ? (({ protocol, username, password, host }) => `${protocol}//${username}${password ? ':' + password : ''}@${host}`)(new URL(process.env.E2E_ADMIN_URL)) : startPostgres()
  const boot = adminSql(`${server}/postgres`)
  await boot.unsafe(`drop database if exists ${DB} with (force)`); await boot.unsafe(`create database ${DB}`); await boot.end()
  const adminUrl = `${server}/${DB}`
  sh('bash scripts/verify/apply-migrations.sh', { ADMIN_URL: adminUrl })
  // A·2's analytics database: a second database on the same server (the roles are shared; their limits are per database).
  const boot2 = adminSql(`${server}/postgres`)
  await boot2.unsafe(`drop database if exists ${DB}_analytics with (force)`); await boot2.unsafe(`create database ${DB}_analytics`); await boot2.end()
  sh('bash scripts/verify/apply-analytics-migrations.sh', { ANALYTICS_ADMIN_URL: `${server}/${DB}_analytics` })
  sh(`psql "${adminUrl}" -q -v ON_ERROR_STOP=1 -f e2e/seed.sql`)
  const pw = randomBytes(18).toString('hex')
  const db = adminSql(adminUrl)
  await db.unsafe(`alter role frata_app password '${pw}'`)
  const adminPw = randomBytes(18).toString('hex')
  await db.unsafe(`alter role frata_admin password '${adminPw}'`)

  run('fake-auth', 'node', ['e2e/fakes/auth.mjs'], { PORT: String(PORTS.auth) })
  run('fake-razorpay', 'node', ['e2e/fakes/razorpay.mjs'], { PORT: String(PORTS.razorpay) })
  run('fake-meta', 'node', ['e2e/fakes/meta.mjs'], { PORT: String(PORTS.meta) })
  run('fake-domains', 'node', ['e2e/fakes/domains.mjs'], { PORT: String(PORTS.domains) })
  run('fake-mux', 'node', ['e2e/fakes/mux.mjs'], { PORT: String(PORTS.mux), APP: `http://localhost:${PORTS.app}` })
  if (build) {
    // The database is migrated and seeded already: the build reads the plans, so the public pages' prices, the hero's
    // example order and the partner calculator render in e2e (impact review W·1).
    try { sh('npm run build', { ...PUBLIC_ENV, DATABASE_URL: `postgres://frata_app:${pw}@${new URL(server).host}/${DB}` }) } catch (e) {
      // The lines that say why; if none match (a killed build), the log's last lines, so a failure always says something.
      const lines = String(e.stdout ?? '') .split('\n').concat(String(e.stderr ?? '').split('\n'))
      const why = lines.filter((l) => /rror|check:|Killed|ENOSPC|EADDRINUSE/.test(l)).slice(0, 15)
      throw new Error(`build failed (${e.code ?? e.status ?? e.signal ?? 'no code'}): ${String(e.message).split('\n')[0]}\n` + (why.length ? why : lines.filter(Boolean).slice(-15)).join('\n'))
    }
  }
  sh('rm -rf .next/cache')
  const host = new URL(server).host
  run('next', 'npx', ['next', 'start', '-p', String(PORTS.app)], {
    ...PUBLIC_ENV, DATABASE_URL: `postgres://frata_app:${pw}@${host}/${DB}`, ADMIN_DATABASE_URL: `postgres://frata_admin:${adminPw}@${host}/${DB}`, ANALYTICS_DATABASE_URL: `postgres://frata_app:${pw}@${host}/${DB}_analytics`, PAYMENT_KEYS_SECRET: 'e2e-only-secret', TRIAL_CLAIM_SECRET: 'e2e-trial-claim-secret', FRRATA_WA_PHONE_NUMBER_ID: '200000000099', FRRATA_WA_TOKEN: 'EAAe2efrratasignup', FRRATA_WA_SIGNUP_TEMPLATE: 'frrata_signup_code',
    RAZORPAY_API_BASE: `http://localhost:${PORTS.razorpay}`, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x_y', BLOB_STORE_ID: 'store_e2e', CRON_SECRET: 'e2e-cron', E2E_FIXTURES: '1', GSP_PROVIDER: 'fake', BILLING_TEST_ISSUE: '1', RAZORPAY_BILLING_KEY_ID: BILLING_KEYS.id, RAZORPAY_BILLING_KEY_SECRET: BILLING_KEYS.secret, RAZORPAY_BILLING_WEBHOOK_SECRET: BILLING_KEYS.webhook,
    META_APP_SECRET: META.appSecret, WA_VERIFY_TOKEN: META.verifyToken, META_GRAPH_BASE: `http://localhost:${PORTS.meta}`,
    // EkCode (P1): its own number and app on the fake Meta; test-only key rings.
    EKCODE_WA_PHONE_NUMBER_ID: EKCODE.number, EKCODE_WA_TOKEN: EKCODE.token, EKCODE_WA_AUTH_TEMPLATE: EKCODE.template, EKCODE_META_APP_SECRET: EKCODE.appSecret,
    EKCODE_WA_VERIFY_TOKEN: EKCODE.verifyToken, EKCODE_PHONE_PEPPERS: EKCODE.peppers, EKCODE_SEAL_KEYS: EKCODE.seals,
    // Own domains (D2·10): Vercel's API and DNS-over-HTTPS answered by e2e/fakes/domains.mjs (loopback only).
    VERCEL_API_TOKEN: 'e2e-vercel', VERCEL_BILLING_TOKEN: 'e2e-billing', VERCEL_TEAM_ID: 'team_e2e', VERCEL_PROJECT_ID: 'prj_e2e', VERCEL_API_BASE: `http://127.0.0.1:${PORTS.domains}`, DOH_BASE: `http://127.0.0.1:${PORTS.domains}`,
    MUX_TOKEN_ID: MUX.tokenId, MUX_TOKEN_SECRET: MUX.tokenSecret, MUX_READ_TOKEN_ID: MUX.readId, MUX_READ_TOKEN_SECRET: MUX.readSecret, MUX_WEBHOOK_SECRET: MUX.webhook, MUX_ENVIRONMENT_ID: MUX.env,
    MUX_API_BASE: `http://localhost:${PORTS.mux}`, MUX_STREAM_BASE: `http://localhost:${PORTS.mux}/stream`, MUX_IMAGE_BASE: `http://localhost:${PORTS.mux}/image`,
  })
  await until(async () => { try { return (await fetch(CONSOLE)).status > 0 } catch { return false } }, 60_000)
  return { db, adminUrl }
}

export async function down(db) {
  await db?.end()
  for (const p of children) { try { process.kill(-p.pid) } catch {} }
}
