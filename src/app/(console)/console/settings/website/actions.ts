'use server'

import { randomBytes } from 'node:crypto'
import { keyHash } from '@/lib/queries/storefront-keys'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { CAPABILITIES } from '@/domains/tenancy/roles'
import { auditEvents, members, shopSettings, tenants } from '@/lib/db/schema'
import { shopDomains } from '@/lib/db/schema-addresses'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { partnerLinks } from '@/lib/db/schema-partners'
import { hasOwnerIn } from '@/lib/queries/settings'
import { refreshKeys } from '@/lib/queries/storefront-api'
import { refreshShop } from '@/lib/storefront/refresh'
import { refreshKey } from '@/lib/storefront/refresh'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { KEY_NAME_MAX, looksLikeKey, MAX_LIVE_KEYS, mayManageApi, newKey, shownPrefix, siteOriginProblem, TEST_KEY_DAYS } from '@/domains/storefront-api/keys'
import { errName } from '@/lib/log'
import { timeIN } from '@/lib/format-date'

// =============================================================================
// FILE: src/app/(console)/console/settings/website/actions.ts — SETTINGS › WEBSITE's WRITES (V1 Storefront API SA1·1;
// ADR-0018 § 6; mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm).
//
// Who: the capability `api.manage` (CAPABILITIES), then mayManageApi inside the transaction (a partner only while the
// store has no owner); a support visit is refused in words. Each write is an audit_events row (field names only).
// The Website names a live connected domain of this store (the row, never a typed address); a key is made from
// crypto randomness, stored as its sha256 hex, and returned ONCE in this reply (never a URL, a toast, a log or a later
// render). Every change purges what the API cached under the store's keys.
// =============================================================================

const API = CAPABILITIES['api.manage']
const REFUSED = 'Only the owner or a manager can change this.'
const SUPPORT = 'A support visit can’t change this.'
const FAILED = 'We couldn’t save that. Nothing was changed.'
type Done = { ok: true } | { ok: false; error: string }

async function mayManage(tx: Parameters<Parameters<typeof asMember>[2]>[0], auth: Parameters<Parameters<typeof asMember>[2]>[1]): Promise<string | null> {
  if (auth.membership.supportSessionId) return SUPPORT
  const ok = mayManageApi(auth.membership.role, await hasOwnerIn(tx, auth.membership.tenantId))
  return ok ? null : REFUSED
}
const audit = (tx: Parameters<Parameters<typeof asMember>[2]>[0], auth: Parameters<Parameters<typeof asMember>[2]>[1], action: string, target: string, detail: object) =>
  tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action, target, detail })

const WebsiteInput = z.union([
  z.strictObject({ runs: z.literal('frrata') }),
  z.strictObject({ runs: z.literal('elsewhere'), domainId: z.uuid(), www: z.boolean() }),
])

/** Where the store's website runs: on Frrata, or the store's own website at one of its live connected domains. */
export async function setWebsiteAction(input: unknown): Promise<Done> {
  const p = WebsiteInput.safeParse(input)
  if (!p.success) return { ok: false, error: 'Pick a website address.' }
  try {
    const r = await asMember(API, { action: 'website.set', target: 'website' }, async (tx, auth) => {
      const no = await mayManage(tx, auth)
      if (no) return no
      const t = auth.membership.tenantId
      if (p.data.runs === 'frrata') {
        await tx.update(shopSettings).set({ siteOrigin: null, siteDomainId: null }).where(eq(shopSettings.tenantId, t))
      } else {
        const [d] = await tx.select({ apex: shopDomains.apex, withWww: shopDomains.withWww }).from(shopDomains)
          .where(and(eq(shopDomains.id, p.data.domainId), eq(shopDomains.tenantId, t), sql`${shopDomains.provedAt} is not null`, isNull(shopDomains.removedAt), isNull(shopDomains.parkedAt)))
        if (!d) return 'That domain isn’t connected any more. Pick another.'
        const origin = `https://${p.data.www ? `www.${d.apex}` : d.apex}`
        if (siteOriginProblem(origin, d.apex)) return 'Pick a website address.'
        await tx.update(shopSettings).set({ siteOrigin: origin, siteDomainId: p.data.domainId }).where(eq(shopSettings.tenantId, t))
      }
      await audit(tx, auth, 'website.set', 'website', { fields: ['site_origin', 'site_domain_id'] })
      return null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) return { ok: false, error: r.value }
    await refreshKeys(r.tenantId)
    // The store's pages move to the site (or stop moving) from the next copy: only the store entry's own tag (SA1b).
    refreshShop(r.tenantId, 'settings')
    revalidatePath('/console/settings/website')
    return { ok: true }
  } catch (err) {
    console.error('[setWebsite]', errName(err))
    return { ok: false, error: FAILED }
  }
}

const KeyInput = z.strictObject({ name: z.string().trim().min(1).max(KEY_NAME_MAX), kind: z.enum(['public', 'test']) })
export type CreateKeyResult =
  | { ok: true; key: string; row: { id: string; name: string; kind: 'public' | 'test'; prefix: string; createdAt: string; expiresAt: string | null } }
  | { ok: false; error: string; field?: 'name' }

/** A new key, returned once. A test key only before the store first opens, and for 30 days at most. */
export async function createKeyAction(input: unknown): Promise<CreateKeyResult> {
  const p = KeyInput.safeParse(input)
  if (!p.success) return { ok: false, error: 'Add a name.', field: 'name' }
  if (looksLikeKey(p.data.name)) return { ok: false, error: 'Use a name, not the key.', field: 'name' }
  const key = newKey(p.data.kind, (n) => new Uint8Array(randomBytes(n)))
  try {
    const r = await asMember(API, { action: 'storefront_key.create' }, async (tx, auth) => {
      const no = await mayManage(tx, auth)
      if (no) return no
      const t = auth.membership.tenantId
      // Lock the store's settings row first: opening the store updates it, so a test key can't slip in beside an
      // opening (security review 4); the count below is under the same lock.
      await tx.select({ t: shopSettings.tenantId }).from(shopSettings).where(eq(shopSettings.tenantId, t)).for('update')
      const [s] = await tx.select({ opened: tenants.firstOpenedAt }).from(tenants).where(eq(tenants.id, t))
      if (p.data.kind === 'test' && s?.opened) return 'The store is open. Make a Live key.'
      const [n] = await tx.select({ n: count() }).from(storefrontKeys).where(and(eq(storefrontKeys.tenantId, t), isNull(storefrontKeys.revokedAt)))
      if ((n?.n ?? 0) >= MAX_LIVE_KEYS) return 'Delete a key to make another.'
      if (!(await withinLimit(LIMITS.apiKeyCreateShop, t, new Date(), true))) {
        const w = LIMITS.apiKeyCreateShop.windowSeconds * 1000
        return `You can make ${LIMITS.apiKeyCreateShop.max} keys an hour. Try again at ${timeIN(new Date(Math.ceil(Date.now() / w) * w))}.` // clock-ok: the window's end, for words
      }
      // The partner whose person made it (a key follows its partner), never from input: a partner member of this store
      // belongs to the store's one active partner link (partner_links_one_active).
      const [m] = await tx.select({ pm: members.partnerMemberId }).from(members).where(and(eq(members.tenantId, t), eq(members.userId, auth.userId)))
      // (partner_members is Frrata's own table, no frata_app grant: the one active link is the member's partner because
      // app_remove_partner ends the link and the partner's memberships together. Tenancy audit 2026-11-15, LOW.)
      const partnerId = m?.pm
        ? (await tx.select({ id: partnerLinks.partnerId }).from(partnerLinks).where(and(eq(partnerLinks.tenantId, t), isNull(partnerLinks.removedAt))))[0]?.id ?? null
        : null
      const [row] = await tx.insert(storefrontKeys).values({
        tenantId: t, kind: p.data.kind, name: p.data.name, hash: keyHash(key), prefix: shownPrefix(key),
        partnerId, createdBy: auth.userId,
        expiresAt: p.data.kind === 'test' ? sql`now() + ${`${TEST_KEY_DAYS} days`}::interval` : null,
      }).returning({ id: storefrontKeys.id, name: storefrontKeys.name, kind: storefrontKeys.kind, prefix: storefrontKeys.prefix, createdAt: storefrontKeys.createdAt, expiresAt: storefrontKeys.expiresAt })
      await audit(tx, auth, 'storefront_key.create', row!.id, { fields: ['name', 'kind'] })
      return row!
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (typeof r.value === 'string') return { ok: false, error: r.value }
    revalidatePath('/console/settings/website')
    const v = r.value
    return { ok: true, key, row: { id: v.id, name: v.name, kind: v.kind as 'public' | 'test', prefix: v.prefix, createdAt: new Date(v.createdAt).toISOString(), expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null } }
  } catch (err) {
    console.error('[createKey]', errName(err))
    return { ok: false, error: 'We couldn’t make the key. Nothing was changed.' }
  }
}

/** Delete a key for good: websites using it stop within a minute. */
export async function deleteKeyAction(id: unknown): Promise<Done> {
  const p = z.uuid().safeParse(id)
  if (!p.success) return { ok: false, error: FAILED }
  try {
    const r = await asMember(API, { action: 'storefront_key.delete', target: p.data }, async (tx, auth) => {
      const no = await mayManage(tx, auth)
      if (no) return { error: no, hash: null }
      const [row] = await tx.update(storefrontKeys).set({ revokedAt: sql`now()`, revokedBy: auth.userId })
        .where(and(eq(storefrontKeys.id, p.data), eq(storefrontKeys.tenantId, auth.membership.tenantId), isNull(storefrontKeys.revokedAt)))
        .returning({ hash: storefrontKeys.hash })
      if (!row) return { error: 'That key was already deleted.', hash: null }
      await audit(tx, auth, 'storefront_key.delete', p.data, { fields: ['revoked_at'] })
      return { error: null, hash: row.hash }
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value.error !== null || !r.value.hash) return { ok: false, error: r.value.error ?? FAILED }
    refreshKey(r.value.hash)
    revalidatePath('/console/settings/website')
    return { ok: true }
  } catch (err) {
    console.error('[deleteKey]', errName(err))
    return { ok: false, error: FAILED }
  }
}
