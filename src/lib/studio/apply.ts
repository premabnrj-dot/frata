import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { members, shopSettings } from '@/lib/db/schema'
import { studioProposals, studioSessions } from '@/lib/db/schema-studio'
import { saveBrand } from '@/lib/content/save'
import { requireMember } from '@/lib/auth/require-member'
import { storeSvgLogo } from '@/lib/media/brand-files'
import { errName } from '@/lib/log'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { LOGO_SLOT } from '@/domains/studio/proposals'
import { withStudio, type StudioOk } from './with-studio'

// =============================================================================
// FILE: src/lib/studio/apply.ts — A PERSON APPLIES, OR SETS ASIDE, WHAT THE AGENT PROPOSED (plan
// docs/plans/2026-11-22-v3a-runtime.md § The first test step 6; ADR-0020 point 6). The proposal is read under the
// person's bind, on their own session: never another person's. Apply runs the console's own save as that person
// (saveBrand; a logo stored by storeSvgLogo first) with the brand version the person holds, so a brand changed since
// they opened it is refused in saveBrand's words (state 9). Refused on a store with an owner, or an open store, until
// V3b adds the partner's passkey check to Apply (fails closed). The outcome is recorded on the card.
// =============================================================================

export const OWNER_STORE = 'Change this in the store’s own console. Nothing was changed.'
const GONE = 'This change is already applied or set aside. Nothing was changed.'
const WAITS = 'The owner decides this change in Notices.'
const LIMIT = 'You sent 60 requests this hour. Ask again in an hour.'

type Proposal = { id: string; kind: string; value: unknown; decided: boolean; ownerOrOpen: boolean }

async function proposalOf(auth: StudioOk, id: string): Promise<Proposal | null> {
  return withStudio(auth, async (tx) => {
    const [p] = await tx.select({ id: studioProposals.id, kind: studioProposals.kind, value: studioProposals.value,
      // A refused card may be tried again (state 9: Reload Brand, then Apply); applied or set aside is decided.
      decided: sql<boolean>`${studioProposals.appliedAt} is not null or ${studioProposals.dismissedAt} is not null` })
      .from(studioProposals).innerJoin(studioSessions, and(eq(studioSessions.id, studioProposals.sessionId), eq(studioSessions.tenantId, studioProposals.tenantId)))
      .where(and(eq(studioProposals.tenantId, auth.tenantId), eq(studioProposals.id, id), eq(studioSessions.userId, auth.userId)))
    if (!p) return null
    const [o] = await tx.select({ n: sql<number>`count(*)::int` }).from(members).where(and(eq(members.tenantId, auth.tenantId), eq(members.role, 'owner')))
    const [s] = await tx.select({ open: shopSettings.publishedAt }).from(shopSettings).where(eq(shopSettings.tenantId, auth.tenantId))
    return { ...p, ownerOrOpen: (o?.n ?? 0) > 0 || !!s?.open }
  }).catch((e) => { console.error('[studio] proposal', errName(e)); return null })
}

/** Records the card's outcome: on this person's own session only (tenancy audit of R7: never by the id alone). */
async function mark(auth: StudioOk, id: string, set: Partial<typeof studioProposals.$inferInsert>): Promise<void> {
  await withStudio(auth, (tx) => tx.update(studioProposals).set(set)
    .where(and(eq(studioProposals.tenantId, auth.tenantId), eq(studioProposals.id, id), isNull(studioProposals.appliedAt), isNull(studioProposals.dismissedAt),
      sql`${studioProposals.sessionId} in (select s.id from studio_sessions s where s.tenant_id = ${auth.tenantId} and s.user_id = ${auth.userId})`)))
    .catch((e) => console.error('[studio] mark', errName(e))) // its class only (security review of R7, LOW-4)
}

export type ApplyResult = { ok: true } | { ok: false; error: string }

export async function applyProposal(auth: StudioOk, id: string, version: number | null): Promise<ApplyResult> {
  const p = await proposalOf(auth, id)
  if (!p || p.decided) return { ok: false, error: GONE }
  if (p.ownerOrOpen) return { ok: false, error: OWNER_STORE }
  // saveBrand finds its store again (requireMember, cached for this request): it must be the one Studio bound.
  const who = await requireMember(['partner'])
  if (!who.ok || who.membership.tenantId !== auth.tenantId) return { ok: false, error: GONE }
  let patch: Record<string, unknown>
  if (p.kind === 'logo') {
    const svg = (p.value as { svg?: unknown } | null)?.svg
    if (typeof svg !== 'string') return { ok: false, error: GONE }
    // A logo is stored before the save counts its own limit: counted here first, per person (security review of R7, LOW-2).
    if (!(await withinLimit(LIMITS.studioSendUser, auth.userId, new Date(), true))) return { ok: false, error: LIMIT }
    const stored = await storeSvgLogo(auth.tenantId, svg)
    if (!stored.ok) { await mark(auth, id, { refusedAt: new Date(), refusedReason: stored.error.slice(0, 300) }); return { ok: false, error: stored.error } }
    patch = { logos: { [LOGO_SLOT]: stored.url } }
  } else {
    patch = p.value as Record<string, unknown>
  }
  const r = await saveBrand({ version, patch })
  if (!r.ok) {
    await mark(auth, id, { refusedAt: new Date(), refusedReason: r.error.slice(0, 300) })
    return { ok: false, error: r.error }
  }
  // Applied only when the change is live (or already was): a change that waits for an owner who arrived meanwhile is the
  // owner's to decide, in Notices (security review of R7, LOW-1).
  if (r.outcome === 'waits') {
    await mark(auth, id, { refusedAt: new Date(), refusedReason: WAITS })
    return { ok: false, error: WAITS }
  }
  await mark(auth, id, { appliedAt: new Date(), appliedBy: auth.userId, refusedAt: null, refusedReason: null })
  return { ok: true }
}

/** "Not this": the card is set aside; nothing on the store changes. */
export async function dismissProposal(auth: StudioOk, id: string): Promise<{ ok: boolean }> {
  const p = await proposalOf(auth, id)
  if (!p) return { ok: false }
  await mark(auth, id, { dismissedAt: new Date() })
  return { ok: true }
}
