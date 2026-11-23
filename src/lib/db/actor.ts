import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { cache } from 'react'
import { after } from 'next/server'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { POOL, type Tx } from './index'
import { onePerConnection } from './one-per-connection'
import { DATABASE_URL_BUILDER, isBuilderDatabaseConfigured } from '@/lib/env'
import * as schema from './schema'
import { parseDatabaseUrl } from './url'
import { holds, type Capability } from '@/domains/tenancy/roles'

// =============================================================================
// FILE: src/lib/db/actor.ts — A BUILDER'S ONE DOOR TO THE DATABASE (T1c, ADR-0015; plan
// docs/plans/2026-11-15-t1c-builders.md). A partner's Builder never sees orders, shoppers or costs:
//   • An Actor holds its shop's id in a module-private WeakMap. No page can read it, so no page can hand it to a
//     `(tenantId: string)` reader, which runs as frata_app with every grant (the compiler refuses: there is no field).
//   • `withActor` runs the work as frata_builder, a LOGIN role of its own (owner 2026-11-15, question 7): column grants
//     on eight catalogue tables and nothing else, no definer, no way back to frata_app's rights (drizzle/0131).
//   • Both settings ride in one statement; the role's policies need both (an unset member role reads nothing).
// Only src/lib/auth/require-capability.ts makes an Actor, and Studio's asTurn (src/lib/studio/as-turn.ts, ADR-0020 point 4:
// the second Actor maker; its reads run as frata_builder whatever the person's role); only src/lib/queries/builder.ts and
// the store preview's `previewTenantOf` take one (check:capabilities).
// =============================================================================

export type BuilderActor = { readonly kind: 'builder'; readonly role: 'builder' }
const shops = new WeakMap<BuilderActor, string>()

/** The Builder's Actor for the store requireCapability chose, or a Studio turn's store (asTurn). Called by those two only (the gate). */
export function builderActor(tenantId: string): BuilderActor {
  const a: BuilderActor = Object.freeze({ kind: 'builder', role: 'builder' })
  shops.set(a, tenantId)
  return a
}

/** Refuses an Actor whose role lacks the capability: every function that takes an Actor calls it first (the gate). */
export function assertCan(actor: BuilderActor, cap: Capability): void {
  if (!shops.has(actor) || !holds(actor.role, cap)) throw new CapabilityError(cap)
}
export class CapabilityError extends Error { override name = 'CapabilityError'; constructor(cap: string) { super(`refused: ${cap}`) } }

/** The Builder's login is not set (a preview, or before the orchestrator adds the secret): refuse, never fall back. */
export class BuilderDbMissing extends Error { override name = 'BuilderDbMissing' }

const connect = (max = 2) => {
  if (!isBuilderDatabaseConfigured()) throw new BuilderDbMissing('DATABASE_URL_BUILDER is not set')
  const conn = onePerConnection(postgres(parseDatabaseUrl(DATABASE_URL_BUILDER, 'frata_builder', 'DATABASE_URL_BUILDER'), { ...POOL, max, idle_timeout: 5 }), max)
  return { conn, db: drizzle(conn, { schema }) }
}
/** Studio's advance (src/lib/studio/advance.ts) runs outside a render, where React's cache does not hold: one
 *  frata_builder connection for the whole advance, opened lazily and ended with it (speed review M2). */
const scope = new AsyncLocalStorage<{ made: ReturnType<typeof connect> | null }>()
export async function withBuilderScope<T>(work: () => Promise<T>): Promise<T> {
  const s: { made: ReturnType<typeof connect> | null } = { made: null }
  try { return await scope.run(s, work) } finally { await s.made?.conn.end({ timeout: 2 }).catch(() => {}) }
}

/** One connection per request, ended after it (as adminDb: a Builder's traffic is a few clicks); inside a Builder
 *  scope, the scope's one connection. */
const requestDb = cache(() => {
  const made = connect()
  try { after(() => made.conn.end({ timeout: 2 })) } catch { /* not in a request */ }
  return made.db
})
const builderDb = () => {
  const s = scope.getStore()
  if (!s) return requestDb()
  s.made ??= connect(1) // one connection for the whole advance (speed review of the phase, LOW-9)
  return s.made.db
}

/** The Builder's work, read-only, as frata_builder, with its shop and role set for this transaction only. */
export async function withActor<T>(actor: BuilderActor, cap: Capability, work: (tx: Tx, tenantId: string) => Promise<T>): Promise<T> {
  assertCan(actor, cap)
  const tenantId = shops.get(actor)!
  return builderDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true), set_config('app.member_role', 'builder', true)`)
    return work(tx as unknown as Tx, tenantId)
  }, { accessMode: 'read only' })
}

/**
 * The store preview's shop for a Builder (owner 2026-11-15, question 5): the preview shows what shoppers would see, so it
 * runs the shopper read path (frata_app). The one sanctioned unwrap of an Actor; check:capabilities allows it only in
 * the console preview page.
 */
export function previewTenantOf(actor: BuilderActor): string {
  assertCan(actor, 'preview.read')
  return shops.get(actor)!
}
