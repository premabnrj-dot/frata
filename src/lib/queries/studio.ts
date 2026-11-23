import 'server-only'
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm'
import { turnState, type TurnState } from '@/domains/studio/turn'
import { isToolName } from '@/domains/studio/tools'
import { WORK_WORDS } from '@/domains/studio/words'
import { studioMessages, studioProposals, studioSessions, studioToolCalls, studioTurns } from '@/lib/db/schema-studio'
import { withStudio, type StudioOk } from '@/lib/studio/with-studio'

// =============================================================================
// FILE: src/lib/queries/studio.ts — WHAT STUDIO'S CHAT READS (plan docs/plans/2026-11-22-v3a-runtime.md R7, § The first
// test step 7). One transaction under withStudio (the person bound by the database; the partner lock reads nothing
// else): the person's latest session, its lines after a keyset (`seq`, speed H1), the cards' proposals, and the last
// turn's state and work lines. Plain words and ids of this person's own rows only: never a tool's input or result, a key,
// a cost or another person's session.
// =============================================================================

const PAGE = 200

export type ChatLine = { seq: number; id: string; kind: 'person' | 'agent' | 'card' | 'status'; text: string | null; proposalId: string | null }
export type ChatCard = { id: string; kind: 'tokens' | 'logo'; value: unknown; state: 'open' | 'applied' | 'refused' | 'dismissed'; reason: string | null }
export type ChatTurn = { id: string; state: TurnState; failedReason: string | null; work: { words: string; done: boolean }[] }
export type Chat = { sessionId: string | null; open: boolean; lines: ChatLine[]; cards: ChatCard[]; turn: ChatTurn | null }

export const EMPTY_CHAT: Chat = { sessionId: null, open: false, lines: [], cards: [], turn: null }

/** The chat from `after` (a seq; null: from the start). */
export function studioChat(auth: StudioOk, after: number | null): Promise<Chat> {
  return withStudio(auth, async (tx) => {
    const t = auth.tenantId
    const [s] = await tx.select({ id: studioSessions.id, endedAt: studioSessions.endedAt }).from(studioSessions)
      .where(and(eq(studioSessions.tenantId, t), eq(studioSessions.userId, auth.userId))).orderBy(desc(studioSessions.createdAt)).limit(1)
    if (!s) return EMPTY_CHAT
    const [lines, [turn]] = await Promise.all([
      tx.select({ seq: studioMessages.seq, id: studioMessages.id, kind: studioMessages.kind, text: studioMessages.text, proposalId: studioMessages.proposalId })
        .from(studioMessages).where(and(eq(studioMessages.tenantId, t), eq(studioMessages.sessionId, s.id), ...(after !== null ? [gt(studioMessages.seq, after)] : [])))
        .orderBy(asc(studioMessages.seq)).limit(PAGE),
      tx.select({ id: studioTurns.id, sentAt: studioTurns.sentAt, startedAt: studioTurns.startedAt, endedAt: studioTurns.endedAt, pausedAt: studioTurns.pausedAt,
        failedAt: studioTurns.failedAt, failedReason: studioTurns.failedReason }).from(studioTurns)
        .where(and(eq(studioTurns.tenantId, t), eq(studioTurns.sessionId, s.id))).orderBy(desc(studioTurns.sentAt)).limit(1),
    ])
    const ids = lines.map((l) => l.proposalId).filter((x): x is string => !!x)
    const [props, calls] = await Promise.all([
      ids.length ? tx.select({ id: studioProposals.id, kind: studioProposals.kind, value: studioProposals.value, appliedAt: studioProposals.appliedAt, refusedAt: studioProposals.refusedAt,
        refusedReason: studioProposals.refusedReason, dismissedAt: studioProposals.dismissedAt }).from(studioProposals)
        .where(and(eq(studioProposals.tenantId, t), eq(studioProposals.sessionId, s.id), inArray(studioProposals.id, ids))) : Promise.resolve([]),
      turn ? tx.select({ name: studioToolCalls.name, executedAt: studioToolCalls.executedAt }).from(studioToolCalls)
        .where(and(eq(studioToolCalls.tenantId, t), eq(studioToolCalls.turnId, turn.id))).orderBy(asc(studioToolCalls.seenAt)) : Promise.resolve([]),
    ])
    const state = turn ? turnState(turn) : null
    return {
      sessionId: s.id,
      open: s.endedAt === null,
      lines: lines.map((l) => ({ ...l, kind: l.kind as ChatLine['kind'] })),
      cards: props.map((p) => ({
        id: p.id, kind: p.kind as ChatCard['kind'], value: p.value, reason: p.refusedReason,
        state: p.appliedAt ? 'applied' : p.dismissedAt ? 'dismissed' : p.refusedAt ? 'refused' : 'open',
      })),
      turn: turn && state ? {
        id: turn.id, state, failedReason: turn.failedReason,
        work: calls.filter((c) => isToolName(c.name)).map((c) => {
          const w = WORK_WORDS[c.name as keyof typeof WORK_WORDS]
          return { words: c.executedAt || state !== 'running' ? w.done : w.running, done: !!c.executedAt || state !== 'running' }
        }),
      } : null,
    }
  })
}
