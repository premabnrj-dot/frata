// =============================================================================
// FILE: e2e/stack.mjs
//
// THE LOCAL STACK for end-to-end flows: a throwaway Postgres (fresh database
// every run, every migration, e2e/seed.sql), the fake Supabase auth and fake
// Razorpay, and a production build started on PORTS.app. Never touches
// Supabase or any non-local database. With E2E_ADMIN_URL (CI's service
// Postgres) it uses that database instead of starting its own.
// The app's password is made up per run and never printed.
// =============================================================================
import { execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync } from 'node:fs'
import { CONSOLE, OUT, PORTS, SHOP_DOMAIN, adminSql, until } from './lib.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const PG_DIR = '/var/tmp/frata-e2e', PG_BIN = '/usr/lib/postgresql/16/bin', DB = 'frata_e2e'
const sh = (cmd, env = {}) => execSync(cmd, { cwd: ROOT, stdio: 'pipe', env: { ...process.env, ...env } }).toString()
const asPg = (cmd) => sh(`su postgres -c "${cmd}"`)

const PUBLIC_ENV = {
  NEXT_PUBLIC_SHOP_DOMAIN: SHOP_DOMAIN, NEXT_PUBLIC_CONSOLE_HOST: 'localhost',
  NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORTS.auth}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon',
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
  const server = process.env.E2E_ADMIN_URL ? (({ protocol, username, password, host }) => `${protocol}//${username}${password ? ':' + password : ''}@${host}`)(new URL(process.env.E2E_ADMIN_URL)) : startPostgres()
  const boot = adminSql(`${server}/postgres`)
  await boot.unsafe(`drop database if exists ${DB} with (force)`); await boot.unsafe(`create database ${DB}`); await boot.end()
  const adminUrl = `${server}/${DB}`
  sh('bash scripts/verify/apply-migrations.sh', { ADMIN_URL: adminUrl })
  sh(`psql "${adminUrl}" -q -v ON_ERROR_STOP=1 -f e2e/seed.sql`)
  const pw = randomBytes(18).toString('hex')
  const db = adminSql(adminUrl)
  await db.unsafe(`alter role frata_app password '${pw}'`)

  run('fake-auth', 'node', ['e2e/fakes/auth.mjs'], { PORT: String(PORTS.auth) })
  run('fake-razorpay', 'node', ['e2e/fakes/razorpay.mjs'], { PORT: String(PORTS.razorpay) })
  if (build) {
    try { sh('npm run build', PUBLIC_ENV) } catch (e) { throw new Error('build failed:\n' + String(e.stdout ?? e).split('\n').filter((l) => /rror|check:/.test(l)).slice(0, 15).join('\n')) }
  }
  sh('rm -rf .next/cache')
  const host = new URL(server).host
  run('next', 'npx', ['next', 'start', '-p', String(PORTS.app)], {
    ...PUBLIC_ENV, DATABASE_URL: `postgres://frata_app:${pw}@${host}/${DB}`, PAYMENT_KEYS_SECRET: 'e2e-only-secret',
    RAZORPAY_API_BASE: `http://localhost:${PORTS.razorpay}`, BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x_y', BLOB_STORE_ID: 'store_e2e', CRON_SECRET: 'e2e-cron',
  })
  await until(async () => { try { return (await fetch(CONSOLE)).status > 0 } catch { return false } }, 60_000)
  return { db, adminUrl }
}

export async function down(db) {
  await db?.end()
  for (const p of children) { try { process.kill(-p.pid) } catch {} }
}
