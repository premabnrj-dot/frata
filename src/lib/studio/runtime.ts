import 'server-only'
import type { MicroUsd } from '@/domains/money/usd'

// =============================================================================
// FILE: src/lib/studio/runtime.ts — THE ONE DOOR TO STUDIO'S AGENT RUNTIME (ADR-0020 point 2; plan
// docs/plans/2026-11-22-v3a-runtime.md R3). Nothing else calls Anthropic for a session. Today one implementation,
// Managed Agents (runtime-managed.ts); the Agent SDK path would be a second one behind this same interface, built only on
// ADR-0020 point 7's switch signal. Callers never hold a transaction across any of these calls (check:studio).
// Every event the runtime answers is turned into StudioEvent, our own small shape: ids, times, names, text, tool inputs
// as data. Never a vendor's error words (they can quote content): failures surface as RuntimeError with our code.
// =============================================================================

export type StudioEvent =
  | { id: string; at: string; kind: 'user_message' }
  | { id: string; at: string; kind: 'tool_use'; name: string; input: unknown }
  | { id: string; at: string; kind: 'agent_message'; text: string }
  | { id: string; at: string; kind: 'request_end'; cost: MicroUsd }
  | { id: string; at: string; kind: 'idle'; stop: 'end_turn' | 'requires_action' | 'budget_reached' | 'refusal' | 'retries_exhausted'; pending: string[] }
  | { id: string; at: string; kind: 'error' }
  | { id: string; at: string; kind: 'terminated' }
  | { id: string; at: string; kind: 'other' }

export type ToolAnswer = { toolUseId: string; text: string; isError: boolean }

export type StartInput = {
  title: string
  budgetCents: number
  vaultId: string
  fileId: string | null
}

export type RuntimeErrorCode = 'unconfigured' | 'refused' | 'not_found' | 'budget' | 'limited' | 'unavailable' | 'timeout'
export class RuntimeError extends Error {
  override name = 'RuntimeError'
  constructor(readonly code: RuntimeErrorCode) { super(code) }
}

export interface StudioRuntime {
  /** The live agent matches the committed agent file (model, geo, tools, network): binding change 1. */
  agentMatches(): Promise<boolean>
  /** A vault holding the build key as a header credential for exactly api.frrata.shop. */
  createVault(buildKey: string): Promise<string>
  deleteVault(vaultId: string): Promise<void>
  /** Starter 0 as a session file (the stand-in for the site repository until V3a·7). */
  uploadStarter(bytes: Uint8Array, sha256: string): Promise<string>
  deleteFile(fileId: string): Promise<void>
  /** A session, always with a budget (a budget can never be added later). Returns the runtime's session id. */
  start(input: StartInput): Promise<string>
  setBudget(runtimeId: string, cents: number): Promise<void>
  send(runtimeId: string, text: string): Promise<void>
  /** Every pending call of a round in ONE send (spike: answering one by one raises an extra idle each). */
  answer(runtimeId: string, answers: ToolAnswer[]): Promise<void>
  interrupt(runtimeId: string): Promise<void>
  /** Events processed at or after `since` (ascending), at most `limit`; the caller skips ids it already stored. */
  events(runtimeId: string, since: string | null, limit: number): Promise<StudioEvent[]>
  /** The session's cumulative list cost (whole cents, as micro-dollars) and whether it still runs. */
  usage(runtimeId: string): Promise<{ listCost: MicroUsd; status: 'running' | 'idle' | 'terminated' | 'other' }>
  archive(runtimeId: string): Promise<void>
  remove(runtimeId: string): Promise<void>
}
