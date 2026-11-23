import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { builderActor, type BuilderActor } from '@/lib/db/actor'
import { isStudioConfigured, STUDIO_OPEN } from '@/lib/env'

// =============================================================================
// FILE: src/lib/studio/as-turn.ts — THE ONE CHOKEPOINT FOR A TOOL CALL (ADR-0020 point 4; plan
// docs/plans/2026-11-22-v3a-runtime.md R5). The second sanctioned Actor maker beside require-capability.ts
// (check:capabilities). The turn is Frrata's own row, never an id from the runtime or a tool's input; the store is the
// turn's. The person is checked in ITS OWN SHORT TRANSACTION, which then closes (`app_turn_actor`: membership, link,
// assignment, both REAL step-ups, the session and turn still open). Reads then run outside any transaction as
// frata_builder (`reads`, an Actor for src/lib/queries/builder.ts). A write runs in its own store transaction in which the
// database binds the turn's person again (`app_studio_bind_turn`); without that bind the partner lock reads and writes
// nothing. A tool never opens a connection of its own (check:studio).
// =============================================================================

export type TurnRef = { tenantId: string; sessionId: string; turnId: string }

export type TurnContext = {
  readonly turn: TurnRef
  /** frata_builder reads of this store (src/lib/queries/builder.ts takes it). */
  readonly reads: BuilderActor
  /** A write in its own store transaction with the turn's person bound by the database; refuses when it won't bind. */
  write<T>(work: (tx: Tx, partnerId: string) => Promise<T>): Promise<T>
}

export type TurnRefusal = 'switch' | 'actor'
export class TurnUnbound extends Error { override name = 'TurnUnbound' }

/** The turn's person re-checked now, in a short transaction that closes before any read or call. */
async function actorLive(t: TurnRef): Promise<boolean> {
  const rows = await withTenant(t.tenantId, (tx) => tx.execute(sql`select session_id from app_turn_actor(${t.turnId}::uuid)`))
  const r = (rows as unknown as { session_id: string }[])[0]
  return r?.session_id === t.sessionId
}

/** The one bind step for a turn: a store transaction in which the database binds the turn's person, then the work;
 *  null (nothing run) when it won't bind. The advance's steps and asTurn's writes both go through it. */
export function withTurnBound<T>(tenantId: string, turnId: string, work: (tx: Tx, partnerId: string) => Promise<T>): Promise<T | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`select app_studio_bind_turn(${turnId}::uuid) as p`)
    const partnerId = (rows as unknown as { p: string | null }[])[0]?.p ?? null
    return partnerId ? work(tx, partnerId) : null
  })
}

export async function asTurn<T>(turn: TurnRef, work: (ctx: TurnContext) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; why: TurnRefusal }> {
  if (STUDIO_OPEN !== 'staff' || !isStudioConfigured()) return { ok: false, why: 'switch' }
  if (!(await actorLive(turn))) return { ok: false, why: 'actor' }
  const ctx: TurnContext = {
    turn,
    reads: builderActor(turn.tenantId),
    write: async (w) => {
      const r = await withTurnBound(turn.tenantId, turn.turnId, async (tx, partnerId) => ({ v: await w(tx, partnerId) }))
      if (!r) throw new TurnUnbound('not bound')
      return r.v
    },
  }
  // The person gone between the check and a write (impact review H1): the same answer as gone before it.
  try { return { ok: true, value: await work(ctx) } } catch (err) {
    if (err instanceof TurnUnbound) return { ok: false, why: 'actor' }
    throw err
  }
}
