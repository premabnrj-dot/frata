import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
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
// they opened it is refused in saveBrand's words (state 9). V3b K1 (docs/plans/2026-11-24-v3b-first.md): on an open store
// saveBrand makes it the store's ONE waiting change, the same one a partner's own Brand save makes; the card records that
// change's id and reads its decision from brand_proposals (sent, approved, declined, replaced). The owner or a Manager
// decides it on Console › Brand and in Notices (decideBrand, shop.manage, in person); nothing here or in the agent's tools
// can. Studio's door already holds the partner's passkey check (requireStudio). The outcome is recorded on the card.
// =============================================================================

const GONE = 'This change is already applied or set aside. Nothing was changed.'
const LIMIT = 'You sent 60 requests this hour. Ask again in an hour.'

const NOTHING = 'We couldn’t save that. Nothing was changed.'

type Proposal = { id: string; kind: string; value: unknown; decided: boolean }

async function proposalOf(auth: StudioOk, id: string): Promise<Proposal | null> {
  return withStudio(auth, async (tx) => {
    const [p] = await tx.select({ id: studioProposals.id, kind: studioProposals.kind, value: studioProposals.value,
      // A refused card may be tried again (state 9: Reload Brand, then Apply); applied, sent or set aside is decided.
      decided: sql<boolean>`${studioProposals.appliedAt} is not null or ${studioProposals.dismissedAt} is not null or ${studioProposals.brandProposalId} is not null` })
      .from(studioProposals).innerJoin(studioSessions, and(eq(studioSessions.id, studioProposals.sessionId), eq(studioSessions.tenantId, studioProposals.tenantId)))
      .where(and(eq(studioProposals.tenantId, auth.tenantId), eq(studioProposals.id, id), eq(studioSessions.userId, auth.userId)))
    return p ?? null
  }).catch((e) => { console.error('[studio] proposal', errName(e)); return null })
}

/** Records the card's outcome: on this person's own session only (tenancy audit of R7: never by the id alone). */
async function mark(auth: StudioOk, id: string, set: Partial<typeof studioProposals.$inferInsert>): Promise<void> {
  await withStudio(auth, (tx) => tx.update(studioProposals).set(set)
    .where(and(eq(studioProposals.tenantId, auth.tenantId), eq(studioProposals.id, id), isNull(studioProposals.appliedAt), isNull(studioProposals.dismissedAt), isNull(studioProposals.brandProposalId),
      sql`${studioProposals.sessionId} in (select s.id from studio_sessions s where s.tenant_id = ${auth.tenantId} and s.user_id = ${auth.userId})`)))
    .catch((e) => console.error('[studio] mark', errName(e))) // its class only (security review of R7, LOW-4)
}

/** `sent`: the store is open, so the change now waits for the owner (the card reads "Sent to the owner"). */
export type ApplyResult = { ok: true; sent?: true } | { ok: false; error: string }

export async function applyProposal(auth: StudioOk, id: string, version: number | null): Promise<ApplyResult> {
  const p = await proposalOf(auth, id)
  if (!p || p.decided) return { ok: false, error: GONE }
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
  // An open store: the change waits for the owner. Applied only when live; a waiting card is "Sent to the owner" and
  // follows that change's decision (security review of R7, LOW-1: never "Applied" before the owner says so).
  if (r.outcome === 'waits') {
    if (!r.proposalId) return { ok: false, error: NOTHING }
    await markSent(auth, id, r.proposalId)
    return { ok: true, sent: true }
  }
  await mark(auth, id, { appliedAt: new Date(), appliedBy: auth.userId, refusedAt: null, refusedReason: null })
  return { ok: true }
}

/** A card sent to the owner: its waiting change recorded once. Two Applies at once each make a change and the second
 *  replaces the first (tenancy audit 2026-11-24, LOW): the later one may take the card from a change already replaced. */
async function markSent(auth: StudioOk, id: string, change: string): Promise<void> {
  await withStudio(auth, (tx) => tx.update(studioProposals).set({ brandProposalId: change, refusedAt: null, refusedReason: null })
    .where(and(eq(studioProposals.tenantId, auth.tenantId), eq(studioProposals.id, id), isNull(studioProposals.appliedAt), isNull(studioProposals.dismissedAt),
      sql`(${studioProposals.brandProposalId} is null or ${studioProposals.brandProposalId} in
        (select b.id from brand_proposals b where b.tenant_id = ${auth.tenantId} and b.decision = 'replaced'))`,
      sql`${studioProposals.sessionId} in (select s.id from studio_sessions s where s.tenant_id = ${auth.tenantId} and s.user_id = ${auth.userId})`)))
    .catch((e) => console.error('[studio] mark sent', errName(e)))
}

/** "Not this": the card is set aside; nothing on the store changes. */
export async function dismissProposal(auth: StudioOk, id: string): Promise<{ ok: boolean }> {
  const p = await proposalOf(auth, id)
  if (!p) return { ok: false }
  await mark(auth, id, { dismissedAt: new Date() })
  return { ok: true }
}
