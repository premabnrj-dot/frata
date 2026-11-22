import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { auditEvents, members, shopSettings } from '@/lib/db/schema'
import { partnerLinks } from '@/lib/db/schema-partners'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { keyHash } from '@/lib/queries/storefront-keys'
import { BUILD_KEY_HOURS, KEY_NAME_MAX, MAX_LIVE_BUILD_KEYS, newKey, shownPrefix, type BuildPurpose } from '@/domains/storefront-api/keys'
import { holds } from '@/domains/tenancy/roles'

// =============================================================================
// FILE: src/lib/storefront-api/build-keys.ts — THE ONE MINTING PATH FOR BUILD KEYS (Studio plan G·2; ADR-0018's
// build-key amendment, points 1–2 and 7).
//
// A build key (`frs_build_…`) reads a store's drafts from a server, in the Frrata-Key header. It is made ONLY here,
// inside the store's own tenant transaction (the caller's: asMember, or the device sign-in's), by a person holding
// `api.manage` (owners, Managers, a partner's people with a members row on this store), never on a support visit. Its
// partner comes from the maker's members row and the store's one live partner link, never from input; its end from its
// purpose (24 hours; a preview's up to 30 days); stored as its sha256 hex. The plain key is returned once, to be put
// straight into a session's vault, a preview's sensitive variable or the developer's CLI: never a URL, a log, a row or a
// later read. Every mint is an audit_events row (field names only) and counts against the store's hourly limit.
// No inbound endpoint calls this with a key in its answer except the device sign-in (G·3), which hands it to one CLI.
// =============================================================================

export type BuildMaker = { tenantId: string; userId: string; email: string; role: string; support: boolean }
export type Minted = { ok: true; id: string; key: string; expiresAt: string } | { ok: false; why: 'not_allowed' | 'busy' | 'full' | 'name' }

export async function mintBuildKey(tx: Tx, maker: BuildMaker, input: { purpose: BuildPurpose; name: string; hours?: number }): Promise<Minted> {
  if (maker.support || !holds(maker.role, 'api.manage')) return { ok: false, why: 'not_allowed' }
  const name = input.name.trim()
  if (!name || name.length > KEY_NAME_MAX) return { ok: false, why: 'name' }
  const t = maker.tenantId
  const [m] = await tx.select({ pm: members.partnerMemberId }).from(members).where(and(eq(members.tenantId, t), eq(members.userId, maker.userId)))
  if (!m) return { ok: false, why: 'not_allowed' }
  // A partner person's key follows the store's one live partner link (as createKeyAction's rule; tenancy audit L).
  const partnerId = m.pm
    ? (await tx.select({ id: partnerLinks.partnerId }).from(partnerLinks).where(and(eq(partnerLinks.tenantId, t), isNull(partnerLinks.removedAt))))[0]?.id ?? null
    : null
  if (m.pm && !partnerId) return { ok: false, why: 'not_allowed' }
  // The store's settings row first, as createKeyAction does: two mints count under one lock, and none slips in beside
  // an opening (which updates that row).
  await tx.select({ t: shopSettings.tenantId }).from(shopSettings).where(eq(shopSettings.tenantId, t)).for('update')
  const [n] = await tx.select({ n: count() }).from(storefrontKeys)
    .where(and(eq(storefrontKeys.tenantId, t), eq(storefrontKeys.kind, 'build'), isNull(storefrontKeys.revokedAt), gt(storefrontKeys.expiresAt, sql`now()`)))
  if ((n?.n ?? 0) >= MAX_LIVE_BUILD_KEYS) return { ok: false, why: 'full' }
  if (!(await withinLimit(LIMITS.apiBuildKeyShop, t, new Date(), true))) return { ok: false, why: 'busy' }
  const hours = Math.max(1, Math.min(Math.floor(input.hours ?? BUILD_KEY_HOURS[input.purpose]), BUILD_KEY_HOURS[input.purpose]))
  const key = newKey('build', (k) => new Uint8Array(randomBytes(k)))
  const [row] = await tx.insert(storefrontKeys).values({
    tenantId: t, kind: 'build', purpose: input.purpose, name, hash: keyHash(key), prefix: shownPrefix(key), partnerId, createdBy: maker.userId,
    expiresAt: sql`now() + ${`${hours} hours`}::interval`,
  }).returning({ id: storefrontKeys.id, expiresAt: storefrontKeys.expiresAt })
  await tx.insert(auditEvents).values({ tenantId: t, actorUserId: maker.userId, actorEmail: maker.email, actorKind: 'member', action: 'storefront_key.mint', target: row!.id, detail: { fields: ['purpose', 'name'] } })
  return { ok: true, id: row!.id, key, expiresAt: new Date(row!.expiresAt!).toISOString() }
}
