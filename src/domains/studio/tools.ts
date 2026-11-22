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
import { COLOUR_ROLES, DENSITIES, FONTS, RADII, type Radius } from '@/domains/brand/record'

export const TOOL_NAMES = ['store_facts', 'tokens_propose', 'logo_propose', 'preview_build'] as const
export type ToolName = (typeof TOOL_NAMES)[number]
export const isToolName = (n: string): n is ToolName => (TOOL_NAMES as readonly string[]).includes(n)

/** Reads run as frata_builder, whatever the person's role; proposals are rows a person applies; nothing else writes. */
export const TOOL_KIND: Record<ToolName, 'read' | 'propose' | 'hosting'> = {
  store_facts: 'read', tokens_propose: 'propose', logo_propose: 'propose', preview_build: 'hosting',
}

/** The store role that may start a Studio session (members.role). */
export const mayStartSession = (storeRole: string) => storeRole === 'partner'

/** The most an SVG logo proposal may hold (the cleaner allows 200 kB; a logo needs far less). */
export const LOGO_PROPOSAL_MAX = 64 * 1024

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/)
export const TOOL_INPUTS = {
  store_facts: z.strictObject({}),
  tokens_propose: z.strictObject({
    palette: z.strictObject(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex.optional()])) as Record<(typeof COLOUR_ROLES)[number], z.ZodOptional<typeof hex>>).optional(),
    display: z.enum(FONTS).optional(),
    body: z.enum(FONTS).optional(),
    radius: z.union(RADII.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<Radius>, z.ZodLiteral<Radius>]).optional(),
    density: z.enum(DENSITIES).optional(),
  }),
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
  input: 'The input did not match the tool. Nothing was changed.',
  window: 'This call belongs to a request that has ended. Nothing was changed.',
  actor: 'The person who asked can no longer use Studio here. Nothing was changed.',
  unavailable: 'This is not available yet.',
  failed: 'That did not work on Frrata’s side. Nothing was changed.',
} as const
