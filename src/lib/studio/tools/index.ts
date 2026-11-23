import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { isToolName, parseToolInput, TOOL_ERRORS, type ToolName } from '@/domains/studio/tools'
import { studioMessages, studioProposals, studioToolCalls } from '@/lib/db/schema-studio'
import { TurnUnbound, type TurnContext } from '@/lib/studio/as-turn'
import { storeFacts } from './store-facts'
import { tokensPropose } from './tokens-propose'
import { logoPropose } from './logo-propose'
import { previewBuild } from './preview-build'
import { refused, type ToolOutcome } from './types'

// =============================================================================
// FILE: src/lib/studio/tools/index.ts — RUNS ONE STORED TOOL CALL THROUGH ITS TURN (plan
// docs/plans/2026-11-22-v3a-runtime.md R5; ADR-0020 point 4). The input is parsed with its closed schema first (an
// unknown tool or a bad input never runs); the tool reads through asTurn's frata_builder Actor, outside any transaction;
// then ONE write, with the turn's person bound by the database, stores the proposal (unique on its call, so a re-run makes
// no second copy), its card line and the call's result. The result is kept until its send succeeds, so a retry answers
// with the same result. Called only from src/lib/studio/advance.ts.
// =============================================================================

export type StoredCall = { id: string; name: string; input: unknown }
export type CallResult = { answer: unknown; isError: boolean }

/** The most a stored result holds (drizzle/0163's check is 16 kB). */
const RESULT_MAX = 15 * 1024

const BAD = refused(TOOL_ERRORS.input)
async function execute(ctx: TurnContext, name: ToolName, input: unknown): Promise<ToolOutcome> {
  switch (name) {
    case 'store_facts': return parseToolInput(name, input) ? storeFacts(ctx) : BAD
    case 'tokens_propose': { const p = parseToolInput(name, input); return p ? tokensPropose(ctx, p) : BAD }
    case 'logo_propose': { const p = parseToolInput(name, input); return p ? logoPropose(ctx, p) : BAD }
    case 'preview_build': return parseToolInput(name, input) ? previewBuild(ctx) : BAD
  }
}

const fits = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length <= RESULT_MAX

/** What a call answers, never throwing: an unknown tool or a bad input refused unrun, a failure in our words, an answer
 *  over the stored cap refused. */
export async function outcomeOf(ctx: TurnContext, call: Omit<StoredCall, 'id'>): Promise<ToolOutcome> {
  let out: ToolOutcome
  try {
    out = isToolName(call.name) ? await execute(ctx, call.name, call.input) : BAD
  } catch (err) {
    if (err instanceof TurnUnbound) throw err
    console.error('[studio] tool', isToolName(call.name) ? call.name : 'unknown', err instanceof Error ? err.name : 'error')
    out = refused(TOOL_ERRORS.failed)
  }
  return fits(out.answer) ? out : refused(TOOL_ERRORS.failed)
}

/** Runs the call and stores its result once; returns what is stored. */
export async function runCall(ctx: TurnContext, call: StoredCall): Promise<CallResult> {
  return storeResult(ctx, call.id, await outcomeOf(ctx, call))
}

/** Stores a call's answer (and its proposal and card) in one transaction; a call already answered keeps its first result. */
export async function storeResult(ctx: TurnContext, callId: string, out: ToolOutcome): Promise<CallResult> {
  const { tenantId, sessionId } = ctx.turn
  return ctx.write(async (tx, partnerId) => {
    const [row] = await tx.select({ result: studioToolCalls.result, isError: studioToolCalls.isError }).from(studioToolCalls)
      .where(and(eq(studioToolCalls.tenantId, tenantId), eq(studioToolCalls.sessionId, sessionId), eq(studioToolCalls.id, callId))).for('update')
    if (!row) return { answer: { error: TOOL_ERRORS.failed }, isError: true }
    if (row.result !== null) return { answer: row.result, isError: row.isError ?? true }
    if (out.proposal && !out.isError) {
      const [p] = await tx.insert(studioProposals).values({ tenantId, partnerId, sessionId, toolCallId: callId, kind: out.proposal.kind, value: out.proposal.value })
        .onConflictDoNothing({ target: studioProposals.toolCallId }).returning({ id: studioProposals.id })
      if (p) await tx.insert(studioMessages).values({ tenantId, partnerId, sessionId, kind: 'card', proposalId: p.id })
    }
    await tx.update(studioToolCalls).set({ executedAt: sql`now()`, result: out.answer, isError: out.isError })
      .where(and(eq(studioToolCalls.tenantId, tenantId), eq(studioToolCalls.id, callId), isNull(studioToolCalls.result)))
    return { answer: out.answer, isError: out.isError }
  })
}
