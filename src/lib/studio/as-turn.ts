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

/** Binds the turn's person inside a store transaction (the advance and asTurn's writes). Null: the person is gone. */
export async function bindTurn(tx: Tx, turnId: string): Promise<string | null> {
  const rows = await tx.execute(sql`select app_studio_bind_turn(${turnId}::uuid) as p`)
  return (rows as unknown as { p: string | null }[])[0]?.p ?? null
}

export async function asTurn<T>(turn: TurnRef, work: (ctx: TurnContext) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; why: TurnRefusal }> {
  if (STUDIO_OPEN !== 'staff' || !isStudioConfigured()) return { ok: false, why: 'switch' }
  if (!(await actorLive(turn))) return { ok: false, why: 'actor' }
  const ctx: TurnContext = {
    turn,
    reads: builderActor(turn.tenantId),
    write: (w) => withTenant(turn.tenantId, async (tx) => {
      const partnerId = await bindTurn(tx, turn.turnId)
      if (!partnerId) throw new TurnUnbound('not bound')
      return w(tx, partnerId)
    }),
  }
  return { ok: true, value: await work(ctx) }
}
