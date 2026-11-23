import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { isToolName, parseToolInput, TOOL_ERRORS, type ToolName } from '@/domains/studio/tools'
import type { TokensValue } from '@/domains/studio/proposals'
import { studioMessages, studioProposals, studioToolCalls } from '@/lib/db/schema-studio'
import type { TurnContext } from '@/lib/studio/as-turn'
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

async function execute(ctx: TurnContext, name: ToolName, input: unknown): Promise<ToolOutcome> {
  const parsed = parseToolInput(name, input)
  if (parsed === null) return refused(TOOL_ERRORS.input)
  switch (name) {
    case 'store_facts': return storeFacts(ctx)
    case 'tokens_propose': return tokensPropose(ctx, parsed as TokensValue)
    case 'logo_propose': return logoPropose(ctx, parsed as { svg: string })
    case 'preview_build': return previewBuild(ctx)
  }
}

const fits = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length <= RESULT_MAX

/** Runs the call (or answers it with an error) and stores its result once; returns what is stored. */
export async function runCall(ctx: TurnContext, call: StoredCall): Promise<CallResult> {
  let out: ToolOutcome
  try {
    out = isToolName(call.name) ? await execute(ctx, call.name, call.input) : refused(TOOL_ERRORS.input)
  } catch (err) {
    console.error('[studio] tool', call.name, err instanceof Error ? err.name : 'error')
    out = refused(TOOL_ERRORS.failed)
  }
  if (!fits(out.answer)) out = refused(TOOL_ERRORS.failed)
  return storeResult(ctx, call.id, out)
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
