import 'server-only'
import { sql } from 'drizzle-orm'
import { deltaOf } from '@/domains/studio/spend'
import type { MicroUsd } from '@/domains/money/usd'
import type { Tx } from '@/lib/db'
import type { StudioRuntime } from './runtime'

// =============================================================================
// FILE: src/lib/studio/measure.ts — WHAT A TURN COST, MEASURED ONE WAY (plan docs/plans/2026-11-22-v3a-runtime.md
// § Spend cap; architecture review of the phase). The advance, a Send that failed, Stop and the cron's ends all settle
// the delta of the session's cumulative list cost at the runtime since its last settle, read here.
// =============================================================================

const one = <T>(rows: unknown) => (rows as T[])[0]

/** The session's cumulative list cost at the runtime: 0 when no runtime session was recorded (nothing ran there; unit
 *  economics F3), null when it cannot be read (the reserve then stays counted). */
export const listCostOf = (rt: StudioRuntime, runtimeId: string | null): Promise<MicroUsd | null> =>
  runtimeId ? rt.usage(runtimeId).then((u) => u.listCost, () => null) : Promise.resolve(0 as MicroUsd)

/** The measured delta since the last settle (never negative); null when the list cost could not be read. */
export const measuredOf = (spent: MicroUsd, listCost: MicroUsd | null): MicroUsd | null => (listCost === null ? null : deltaOf(spent, listCost))

/** The bound person's session: its measured spend so far and its largest request (the budget formula's inputs). */
export async function spendOf(tx: Tx, sessionId: string): Promise<{ spent: MicroUsd; largest: MicroUsd }> {
  const r = one<{ spent_micro: number; largest_micro: number }>(await tx.execute(sql`select spent_micro, largest_micro from app_studio_spend_of(${sessionId}::uuid)`))
  return { spent: Number(r?.spent_micro ?? 0) as MicroUsd, largest: Number(r?.largest_micro ?? 0) as MicroUsd }
}
