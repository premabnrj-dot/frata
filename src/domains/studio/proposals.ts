// =============================================================================
// FILE: src/domains/studio/proposals.ts — WHAT THE AGENT PROPOSES, CHECKED BEFORE ANY CARD SHOWS IT (spec
// docs/specs/2026-11-16-studio-agent.md § 4; ADR-0014 rule 4: a person changes the store; plan
// docs/plans/2026-11-22-v3a-runtime.md R1, security M4). A proposal is a row a person applies; Apply runs saveBrand
// (src/lib/content/save.ts), which checks everything again. Here the same rules run first, on the live record, so a card
// never draws a value the save would refuse: colours through `brandProblems` (contrast, the font list, the steps), a
// logo through `outlineLogo` (the one SVG cleaner, then outlines only). Tokens and logos carry no free text, so the
// line rules (UPI ids, phones, links) have nothing to read here. Pure.
// =============================================================================

import { brandProblems, type BrandProblem } from '@/domains/brand/check'
import { COLOUR_ROLES, normalHex, type BrandRecord, type LogoSlot } from '@/domains/brand/record'
import { applyPatch } from '@/domains/brand/patch'
import { outlineLogo, OUTLINE_REFUSAL_WORDS, type OutlineRefusal } from '@/domains/brand/outline'
import { SVG_REFUSAL_WORDS } from '@/domains/brand/svg'
import type { ToolInput } from './tools'

export const PROPOSAL_KINDS = ['tokens', 'logo'] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export type TokensValue = ToolInput<'tokens_propose'>
export type LogoValue = { svg: string }

/** The record a tokens proposal would make: saveBrand's own merge (src/domains/brand/patch.ts). */
export const withTokens = (live: BrandRecord, p: TokensValue): BrandRecord => applyPatch(live, p)

/** Whether a tokens proposal changes anything. */
export function changesSomething(live: BrandRecord, p: TokensValue): boolean {
  const next = withTokens(live, p)
  return COLOUR_ROLES.some((r) => next.palette[r] !== live.palette[r]) || next.display !== live.display || next.body !== live.body
    || next.radius !== live.radius || next.density !== live.density
}

export type TokensCheck = { ok: true; value: TokensValue } | { ok: false; problems: BrandProblem[] | 'unchanged' }

/** A tokens proposal checked against the live record: what saveBrand would refuse is refused here first. */
export function checkTokens(live: BrandRecord, p: TokensValue): TokensCheck {
  if (!changesSomething(live, p)) return { ok: false, problems: 'unchanged' }
  const problems = brandProblems(withTokens(live, p))
  if (problems.length) return { ok: false, problems }
  // Keep only what changes, colours in their saved form.
  const palette = p.palette ? Object.fromEntries(Object.entries(p.palette).map(([r, v]) => [r, normalHex(v) ?? v])) : undefined
  return { ok: true, value: { ...p, ...(palette ? { palette } : {}) } as TokensValue }
}

export type LogoCheck = { ok: true; value: LogoValue } | { ok: false; reason: OutlineRefusal | 'too_big'; words: string }

/** What `studio_proposals.value` holds at most, as stored (jsonb text; drizzle/0163's check). */
export const PROPOSAL_VALUE_MAX_BYTES = 72 * 1024

/** A logo proposal: the cleaned, outline-only SVG, or why not (in the person's words). */
export function checkLogo(svg: string): LogoCheck {
  const r = outlineLogo(svg)
  if (r.ok && new TextEncoder().encode(JSON.stringify({ svg: r.svg })).length > PROPOSAL_VALUE_MAX_BYTES) return { ok: false, reason: 'too_big', words: SVG_REFUSAL_WORDS.too_big }
  if (r.ok) return { ok: true, value: { svg: r.svg } }
  const words = r.reason === 'text' || r.reason === 'empty' ? OUTLINE_REFUSAL_WORDS[r.reason] : SVG_REFUSAL_WORDS[r.reason]
  return { ok: false, reason: r.reason, words }
}

/** The slot an agent logo fills: the main logo only, in V3a. */
export const LOGO_SLOT = 'main' as const satisfies LogoSlot
