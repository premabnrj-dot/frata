// =============================================================================
// FILE: src/domains/studio/tools.ts — THE TOOLS STUDIO'S AGENT MAY CALL, AND THEIR INPUTS (spec
// docs/specs/2026-11-16-studio-agent.md § 4; plan docs/plans/2026-11-22-v3a-runtime.md R1, first-test slice).
// Every custom tool runs on Frrata's server through `asTurn` (src/lib/studio/as-turn.ts). The agent file
// (studio/agents/frrata-agent/agent.json) declares the same names with JSON schemas; check:studio compares the two.
// Inputs are parsed here with closed schemas and caps before anything runs; a tool's input is data from the model and
// never names a store, a person or a row (the store is the turn's). Pure.
//
// Who starts a session: a partner's owner or Lead on a store linked to that partner (members role `partner`), while
// Studio is open to staff. A Builder starts nothing in V3a (owner, 2026-11-22: "no need to offer access to builders for
// now"); a Builder's turn would get the read tools and preview only (spec § 4), decided at V3b.
// =============================================================================

import { z } from 'zod'
import { TokensPatch } from '@/domains/brand/patch'

export const TOOL_NAMES = ['store_facts', 'tokens_propose', 'logo_propose', 'preview_build'] as const
export type ToolName = (typeof TOOL_NAMES)[number]
export const isToolName = (n: string): n is ToolName => (TOOL_NAMES as readonly string[]).includes(n)

/** The most an SVG logo proposal may hold (the cleaner allows 200 kB; a logo needs far less). */
export const LOGO_PROPOSAL_MAX = 64 * 1024

export const TOOL_INPUTS = {
  store_facts: z.strictObject({}),
  // saveBrand's own patch shape without the logo slots (src/domains/brand/patch.ts): a proposal parses as what Apply saves.
  tokens_propose: TokensPatch,
  logo_propose: z.strictObject({ svg: z.string().min(1).max(LOGO_PROPOSAL_MAX) }),
  preview_build: z.strictObject({}),
} as const satisfies Record<ToolName, z.ZodType>

export type ToolInput<T extends ToolName> = z.infer<(typeof TOOL_INPUTS)[T]>

/** A tool's parsed input, or null (an unknown tool or an input that doesn't parse is answered as an error, never run). */
export function parseToolInput<T extends ToolName>(name: T, input: unknown): ToolInput<T> | null {
  const r = TOOL_INPUTS[name].safeParse(input)
  return r.success ? (r.data as ToolInput<T>) : null
}

/** What the agent is told when a call is refused: our words, short, never a vendor's or a database's. */
export const TOOL_ERRORS = {
  input: 'The input did not match the tool. Fix it and call again. Nothing was changed.',
  window: 'This call belongs to a request that has ended. Nothing was changed.',
  actor: 'The person who asked can no longer use Studio here. Nothing was changed.',
  unavailable: 'This is not available yet. Tell the person so.',
  failed: 'That did not work on Frrata’s side. Nothing was changed.',
  // Studio's own database setting is wrong (DATABASE_URL_BUILDER; production 2026-11-23): no retry helps until Frrata fixes it.
  setup: 'Nothing was changed. Tell the person, word for word. Studio can’t read your store yet. Frrata is fixing it.',
} as const
