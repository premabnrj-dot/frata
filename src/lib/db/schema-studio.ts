// =============================================================================
// FILE: src/lib/db/schema-studio.ts — STUDIO'S AGENT: SESSIONS, TURNS, TOOL CALLS, PROPOSALS, LINES (plan
// docs/plans/2026-11-22-v3a-runtime.md R2; spec docs/specs/2026-11-16-studio-agent.md § 4–6; ADR-0020 § 4–5).
// Shop tables carry `tenant_id` AND `partner_id`: a restrictive policy matches both the store and the partner the caller
// is bound to in this transaction (a `studio_binds` row only the definers app_studio_partner and app_studio_bind_turn
// write; app_current_partner()), and composite
// foreign keys tie every row to its session's store and partner, so the brand's own staff or a later partner never read
// a session. No frata_builder or frata_admin grant in V3a. A turn's state is its timestamps (src/domains/studio/turn.ts);
// a session's end is `ended_at`. No cost or credit lives here: spend and each turn's person and step-up are
// platform-scope, definer-only tables (`studio_turn_keys`, `studio_spend_*`). Access: drizzle/0167_studio_access.sql.
// =============================================================================

import { sql } from 'drizzle-orm'
import { bigint, boolean, check, foreignKey, index, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, createdAt, id, tenants } from './schema'
import { partnerMembers, partners, partnerStepups } from './schema-partners'
import { staffStepups } from './schema-staff'
import { brandProposals } from './schema-brand'
import { FAIL_REASONS } from '@/domains/studio/turn'
import { PROPOSAL_KINDS } from '@/domains/studio/proposals'
import { sqlList } from '@/domains/tenancy/roles'

export const MESSAGE_KINDS = ['person', 'agent', 'card', 'status'] as const
export const END_REASONS = ['stopped', 'switch', 'idle', 'age', 'actor', 'start_failed', 'restart'] as const
/** A line's text, a tool call's input and result, a proposal's value: capped in the database too. */
export const LINE_MAX = 2000
const INPUT_MAX_BYTES = 72 * 1024
const RESULT_MAX_BYTES = 16 * 1024

export const studioSessions = pgTable('studio_sessions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  partnerMemberId: uuid('partner_member_id').notNull().references(() => partnerMembers.id, { onDelete: 'restrict' }),
  /** The person who started it (one open session a person a store). */
  userId: uuid('user_id').notNull(),
  createdAt: createdAt(),
  /** Anthropic's ids, each written after its row (ADR-0006): the session, its vault, Starter 0's file. */
  runtimeId: text('runtime_id'),
  vaultId: text('vault_id'),
  fileId: text('file_id'),
  /** The 24-hour build key minted for this session; written in the mint's transaction, before any vault call. */
  buildKeyId: uuid('build_key_id'),
  /** Where the next event read starts: the `processed_at` of the last event read (events are listed by it, ascending;
   *  ids already stored are skipped), and the advance lease (§ Advance). */
  eventCursor: text('event_cursor'),
  advancingUntil: at('advancing_until'),
  lastReadAt: at('last_read_at'),
  lastActivityAt: at('last_activity_at').notNull().defaultNow(),
  endedAt: at('ended_at'),
  endReason: text('end_reason'),
  /** The key, vault and file gone and the session archived at Anthropic; then deleted there 30 days after `ended_at`. */
  cleanedAt: at('cleaned_at'),
  deletedAt: at('deleted_at'),
}, (t) => [
  unique('studio_sessions_scope').on(t.tenantId, t.partnerId, t.id),
  uniqueIndex('studio_sessions_runtime').on(t.runtimeId),
  uniqueIndex('studio_sessions_one_open').on(t.tenantId, t.userId).where(sql`${t.endedAt} is null`),
  index('studio_sessions_open').on(t.lastReadAt).where(sql`${t.endedAt} is null`),
  index('studio_sessions_ended').on(t.endedAt).where(sql`${t.endedAt} is not null and ${t.deletedAt} is null`),
  // The cron's clean list, and the chat's latest session (speed review of the phase, LOW-5, LOW-6).
  index('studio_sessions_unclean').on(t.endedAt).where(sql`${t.endedAt} is not null and ${t.cleanedAt} is null`),
  index('studio_sessions_latest').on(t.tenantId, t.userId, t.createdAt.desc()),
  check('studio_sessions_end_reason', sql`${t.endReason} is null or ${t.endReason} in (${sql.raw(sqlList(END_REASONS))})`),
  check('studio_sessions_ended', sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
])


export const studioTurns = pgTable('studio_turns', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  partnerId: uuid('partner_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  sentAt: at('sent_at').notNull().defaultNow(),
  /** The runtime took the message: its `user.message` event id, the start of the turn's call window. */
  startedAt: at('started_at'),
  userMessageEventId: text('user_message_event_id'),
  endedAt: at('ended_at'),
  pausedAt: at('paused_at'),
  failedAt: at('failed_at'),
  failedReason: text('failed_reason'),
}, (t) => [
  foreignKey({ name: 'studio_turns_session', columns: [t.tenantId, t.partnerId, t.sessionId], foreignColumns: [studioSessions.tenantId, studioSessions.partnerId, studioSessions.id] }).onDelete('cascade'),
  unique('studio_turns_scope').on(t.tenantId, t.partnerId, t.id),
  unique('studio_turns_full').on(t.tenantId, t.partnerId, t.sessionId, t.id),
  uniqueIndex('studio_turns_one_open').on(t.sessionId).where(sql`${t.endedAt} is null and ${t.pausedAt} is null and ${t.failedAt} is null`),
  index('studio_turns_session').on(t.sessionId, t.sentAt),
  check('studio_turns_reason', sql`(${t.failedAt} is null) = (${t.failedReason} is null) and (${t.failedReason} is null or ${t.failedReason} in (${sql.raw(sqlList(FAIL_REASONS))}))`),
])

export const studioToolCalls = pgTable('studio_tool_calls', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  partnerId: uuid('partner_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  turnId: uuid('turn_id').notNull(),
  /** Anthropic's `agent.custom_tool_use` event id: a call is stored once, whichever trigger saw it first. */
  toolUseId: text('tool_use_id').notNull(),
  name: text('name').notNull(),
  input: jsonb('input').notNull(),
  seenAt: createdAt(),
  executedAt: at('executed_at'),
  /** Kept until its send succeeds, so a retry answers with the same result. */
  result: jsonb('result'),
  isError: boolean('is_error'),
  answeredAt: at('answered_at'),
}, (t) => [
  foreignKey({ name: 'studio_tool_calls_session', columns: [t.tenantId, t.partnerId, t.sessionId], foreignColumns: [studioSessions.tenantId, studioSessions.partnerId, studioSessions.id] }).onDelete('cascade'),
  foreignKey({ name: 'studio_tool_calls_turn', columns: [t.tenantId, t.partnerId, t.sessionId, t.turnId], foreignColumns: [studioTurns.tenantId, studioTurns.partnerId, studioTurns.sessionId, studioTurns.id] }).onDelete('cascade'),
  unique('studio_tool_calls_once').on(t.sessionId, t.toolUseId),
  unique('studio_tool_calls_scope').on(t.tenantId, t.partnerId, t.id),
  index('studio_tool_calls_pending').on(t.sessionId).where(sql`${t.answeredAt} is null`),
  index('studio_tool_calls_by_turn').on(t.turnId, t.seenAt), // the chat's work lines (speed review of the phase, LOW-6)
  check('studio_tool_calls_caps', sql`octet_length(${t.input}::text) <= ${sql.raw(String(INPUT_MAX_BYTES))} and (${t.result} is null or octet_length(${t.result}::text) <= ${sql.raw(String(RESULT_MAX_BYTES))})`),
])

export const studioProposals = pgTable('studio_proposals', {
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  partnerId: uuid('partner_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  toolCallId: uuid('tool_call_id').notNull(),
  kind: text('kind').notNull(),
  value: jsonb('value').notNull(),
  createdAt: createdAt(),
  appliedAt: at('applied_at'),
  appliedBy: uuid('applied_by'),
  /** saveBrand's words when Apply was refused (state 9), or "Not this". */
  refusedAt: at('refused_at'),
  refusedReason: text('refused_reason'),
  dismissedAt: at('dismissed_at'),
  /** V3b K1: the store's waiting change this card became (saveBrand's outcome `waits`). The card's state after it is
   *  that change's decision, read from brand_proposals: never a second copy of it here. */
  brandProposalId: uuid('brand_proposal_id'),
}, (t) => [
  foreignKey({ name: 'studio_proposals_brand', columns: [t.tenantId, t.brandProposalId], foreignColumns: [brandProposals.tenantId, brandProposals.id] }),
  foreignKey({ name: 'studio_proposals_session', columns: [t.tenantId, t.partnerId, t.sessionId], foreignColumns: [studioSessions.tenantId, studioSessions.partnerId, studioSessions.id] }).onDelete('cascade'),
  foreignKey({ name: 'studio_proposals_call', columns: [t.tenantId, t.partnerId, t.toolCallId], foreignColumns: [studioToolCalls.tenantId, studioToolCalls.partnerId, studioToolCalls.id] }).onDelete('cascade'),
  unique('studio_proposals_once').on(t.toolCallId),
  unique('studio_proposals_scope').on(t.tenantId, t.partnerId, t.id),
  index('studio_proposals_session').on(t.sessionId, t.createdAt),
  check('studio_proposals_kind', sql`${t.kind} in (${sql.raw(sqlList(PROPOSAL_KINDS))})`),
  check('studio_proposals_caps', sql`octet_length(${t.value}::text) <= ${sql.raw(String(INPUT_MAX_BYTES))} and (${t.refusedReason} is null or length(${t.refusedReason}) <= 300)`),
])

export const studioMessages = pgTable('studio_messages', {
  /** The chat's keyset (speed H1: a random uuid sorts out of write order). */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  id: id(),
  tenantId: uuid('tenant_id').notNull(),
  partnerId: uuid('partner_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  kind: text('kind').notNull(),
  /** Plain text the person or the agent wrote (never a tool's input or output, a key or an email). */
  text: text('text'),
  proposalId: uuid('proposal_id'),
  /** The runtime event an agent line came from: stored once, whichever trigger read it first. */
  eventId: text('event_id'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('studio_messages_event').on(t.sessionId, t.eventId).where(sql`${t.eventId} is not null`),
  foreignKey({ name: 'studio_messages_proposal', columns: [t.tenantId, t.partnerId, t.proposalId], foreignColumns: [studioProposals.tenantId, studioProposals.partnerId, studioProposals.id] }).onDelete('cascade'),
  foreignKey({ name: 'studio_messages_session', columns: [t.tenantId, t.partnerId, t.sessionId], foreignColumns: [studioSessions.tenantId, studioSessions.partnerId, studioSessions.id] }).onDelete('cascade'),
  index('studio_messages_keyset').on(t.sessionId, t.seq),
  check('studio_messages_kind', sql`${t.kind} in (${sql.raw(sqlList(MESSAGE_KINDS))})`),
  check('studio_messages_text', sql`${t.text} is null or length(${t.text}) <= ${sql.raw(String(LINE_MAX))}`),
])

// ── Platform scope, definer-only: no role holds any privilege; a restrictive deny-all policy (drizzle/0167). ──────

/** The person behind an open turn and the step-up ROWS they sent it with (never a hash: security review L3). Signing out
 *  or an expired check deletes those rows, which deletes this one and ends the turn. Read only by app_turn_actor. */
export const studioTurnKeys = pgTable('studio_turn_keys', {
  turnId: uuid('turn_id').primaryKey().references(() => studioTurns.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  // Null for a turn sent while passkeys are off (0171): it re-checks the person only, and ends once they are back on.
  staffStepupId: uuid('staff_stepup_id').references(() => staffStepups.id, { onDelete: 'cascade' }),
  partnerStepupId: uuid('partner_stepup_id').references(() => partnerStepups.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
})

/** A session's measured list cost so far and its largest request, in micro-dollars (the budget formula's inputs). */
export const studioSpendSessions = pgTable('studio_spend_sessions', {
  sessionId: uuid('session_id').primaryKey().references(() => studioSessions.id, { onDelete: 'cascade' }),
  spentMicro: bigint('spent_micro', { mode: 'number' }).notNull().default(0),
  largestMicro: bigint('largest_micro', { mode: 'number' }).notNull().default(0),
})

/** A turn's reserve and, once settled, its measured cost (uncapped), counted on the India day it was reserved. */
export const studioSpendTurns = pgTable('studio_spend_turns', {
  turnId: uuid('turn_id').primaryKey().references(() => studioTurns.id, { onDelete: 'cascade' }),
  day: text('day').notNull(),
  userId: uuid('user_id').notNull(),
  reservedMicro: bigint('reserved_micro', { mode: 'number' }).notNull(),
  measuredMicro: bigint('measured_micro', { mode: 'number' }),
  settledAt: at('settled_at'),
  /** The staff test (V3a): never billed; C1 starts an empty ledger (unit economics F9). */
  test: boolean('test').notNull().default(true),
})

/** One row per India day (a key with no nulls: unit economics F4, security M2). */
export const studioSpendDays = pgTable('studio_spend_days', {
  day: text('day').primaryKey(),
  reservedMicro: bigint('reserved_micro', { mode: 'number' }).notNull().default(0),
  measuredMicro: bigint('measured_micro', { mode: 'number' }).notNull().default(0),
})

export const studioSpendPeople = pgTable('studio_spend_people', {
  day: text('day').notNull(),
  userId: uuid('user_id').notNull(),
  reservedMicro: bigint('reserved_micro', { mode: 'number' }).notNull().default(0),
  measuredMicro: bigint('measured_micro', { mode: 'number' }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.userId] })])

/** Who Studio's partner lock answers for in THIS transaction: a random token in the `app.studio_bind` setting, written
 *  only by the binding definers with the transaction's id, so setting the variable by hand binds nothing (tenancy audit
 *  of R2, HIGH). Old rows are swept by the next bind. */
export const studioBinds = pgTable('studio_binds', {
  token: text('token').primaryKey(),
  xact: text('xact').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  partnerId: uuid('partner_id').notNull(),
  /** The person the bind proves (security review M3): sessions and turns are theirs only. */
  userId: uuid('user_id').notNull(),
  memberId: uuid('member_id').notNull(),
  staffStepupId: uuid('staff_stepup_id'),
  partnerStepupId: uuid('partner_stepup_id'),
  createdAt: createdAt(),
}, (t) => [index('studio_binds_age').on(t.createdAt)])
