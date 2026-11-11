import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { attachDatabasePool } from '@vercel/functions'
import { DATABASE_URL } from '@/lib/env'
import * as schema from './schema'
import { parseDatabaseUrl } from './url'

// =============================================================================
// FILE: src/lib/db/index.ts
//
// THE ONE CONNECTION. It logs in as `frata_app` (drizzle/0001), a role with no
// BYPASSRLS, so every tenant table's policy applies to it. Never connect the app
// as `postgres`: that role bypasses the policies that keep merchants apart.
//
// prepare:false because Supabase's pooler runs in transaction mode.
// Lazy, so a build with no DATABASE_URL still compiles every page.
//
// ⚠️ THE URL IS CHECKED BEFORE postgres.js SEES IT. postgres.js throws
// `Invalid URL` with the whole string — password included — as the error's
// `input`, and Vercel logs it (2026-11-06: a password containing `/` leaked
// this way). parseDatabaseUrl (./url.ts) fails with a message, never the value.
// =============================================================================

/**
 * The pool (speed review P12): an idle connection is let go after 20 s, so warm-but-idle functions stop holding
 * Supavisor's client slots (about 200 on small tiers: 20 instances × 10 used them all); a connect that hangs
 * fails in 5 s; a connection is renewed every 10 minutes. `prepare: false` for Supavisor's transaction mode.
 */
export const POOL = { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 5, max_lifetime: 600 } as const

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Vercel Fluid keeps an instance alive between requests; attachDatabasePool (owner, 2026-11-08) holds the function
 * open (waitUntil) until the pool's idle timeout after its last use, so idle connections close cleanly instead of
 * being frozen with the instance. It knows pg, not postgres-js, so it is handed a pg-shaped adapter whose `release`
 * fires after each tenant transaction (withTenant). Only on Vercel: elsewhere there is no request context to extend.
 */
const released: (() => void)[] = []
export const poolReleased = () => { for (const f of released) f() }

/**
 * Attached once, whichever pool opens first. Every query (both pools, through drizzle's logger) also counts as a
 * release, so a request whose last query ran outside withTenant (accessFor, every Admin read) still holds the
 * function open until its connections idle out. Without it a frozen instance kept Admin's sockets, and the next
 * request waited on a dead one: Admin pages that hung (owner, 2026-11-09).
 */
let attached = false
export function attachPool() {
  if (attached || !process.env.VERCEL) return
  attached = true
  attachDatabasePool({ options: { idleTimeoutMillis: POOL.idle_timeout * 1000 }, on: (_event: 'release', listener: () => void) => { released.push(listener) } })
}
export const releaseOnQuery = { logQuery: () => poolReleased() }

let raw: ReturnType<typeof postgres> | null = null

export function db() {
  if (!client) {
    attachPool()
    raw = postgres(parseDatabaseUrl(DATABASE_URL, 'frata_app'), POOL)
    client = drizzle(raw, { schema, logger: releaseOnQuery })
  }
  return client
}

/**
 * Drops this instance's pool (ending its connections in the background): the next db() opens a fresh one. For a
 * query that never answered — a pooled connection lost to a paused instance or to its own idle close racing a new
 * query (Supabase KB: "hanging queries in Serverless Functions"; 2026-11-11: Admin requests waited to Vercel's 60 s).
 */
export function recyclePool() {
  const old = raw
  client = null; raw = null
  if (old) void old.end({ timeout: 1 }).catch(() => undefined)
}

/** `work` with a deadline; past it, the pool is recycled and `work` runs once more on fresh connections. For the
 * first, cheap query of a request (who is signing in), so a lost connection costs seconds, not the request. */
export async function withFreshPool<T>(work: () => Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), ms) })
  try {
    const first = await Promise.race([work(), late])
    if (first !== 'late') return first
  } finally { clearTimeout(timer) }
  console.error('[db] a pooled connection did not answer; opening a fresh pool')
  recyclePool()
  return work()
}

export type Db = ReturnType<typeof db>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
