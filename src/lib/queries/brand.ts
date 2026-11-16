import 'server-only'
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings } from '@/lib/db/schema'
import { brandProposals, brandSeasons, brandTokens } from '@/lib/db/schema-brand'
import { storefrontKeys } from '@/lib/db/schema-storefront-api'
import { DEFAULT_PALETTE } from '@/domains/brand/defaults'
import { emptyRecord, type BrandRecord, type Density, type Font, type Hex, type Radius } from '@/domains/brand/record'
import { readRecord } from '@/domains/brand/schema'
import type { Season } from '@/domains/brand/seasons'
import { hasCodeSite } from '@/domains/brand/code-site'
import { shopCached, shopCatalogue } from './storefront'
import { isListed } from '@/domains/storefront/listing'
import { urlFor } from '@/domains/media/sizes'

// =============================================================================
// FILE: src/lib/queries/brand.ts — A STORE'S BRAND RECORD, READ (one-address plan P1·3; spec § 5; api-contract review
// M5, M6). Named columns only. Shoppers, emails, the API and documents read the LIVE record through the cached loaders:
// never `previous`, `updated_by`, `updated_at` or a waiting proposal (M6). `shopBrand` is a `settings` loader (tag
// `shop:<t>:settings`, the one `shopFor` uses; 60 s); `apiBrand` is the same read at the API's hour (M5: the API never
// reads the 60 s loader). The console page reads the rest (the version, a waiting change, who may decide) in one
// snapshot of its own. A theme shop (no code site) has no brand: null (O19).
// =============================================================================

/** The live columns a reader may see (the Builder's grant is the same list, drizzle/0155). */
const live = {
  logoMark: brandTokens.logoMarkUrl, logoStacked: brandTokens.logoStackedUrl, logoReversed: brandTokens.logoReversedUrl,
  bg: brandTokens.colorBg, panel: brandTokens.colorPanel, text: brandTokens.colorText, muted: brandTokens.colorMuted, accent: brandTokens.colorAccent,
  on: brandTokens.colorOn, edge: brandTokens.colorEdge, line: brandTokens.colorLine, good: brandTokens.colorGood, warn: brandTokens.colorWarn,
  bad: brandTokens.colorBad, display: brandTokens.fontDisplay, body: brandTokens.fontBody, radius: brandTokens.radius, density: brandTokens.density,
}
type LiveRow = Record<'logoMark' | 'logoStacked' | 'logoReversed', string | null> & Record<Exclude<keyof typeof live, 'logoMark' | 'logoStacked' | 'logoReversed' | 'radius'>, string> & { radius: number }

export function recordOf(r: LiveRow | undefined, logoUrl: string | null): BrandRecord | null {
  if (!r) return null
  return {
    logos: { main: logoUrl, mark: r.logoMark, stacked: r.logoStacked, reversed: r.logoReversed },
    palette: { bg: r.bg as Hex, panel: r.panel as Hex, text: r.text as Hex, muted: r.muted as Hex, accent: r.accent as Hex, on: r.on as Hex, edge: r.edge as Hex, line: r.line as Hex, good: r.good as Hex, warn: r.warn as Hex, bad: r.bad as Hex },
    display: r.display as Font, body: r.body as Font, radius: r.radius as Radius, density: r.density as Density,
  }
}

/** What every reader gets: the record (Frrata's defaults until one is saved) and its seasons, or null for a theme shop. */
export type ShopBrand = { record: BrandRecord; saved: boolean; seasons: Season[] }

/** Keys that are not deleted and not expired at `now` (code-site.ts: a site being built). */
const liveKeysWith = async (tx: Tx, t: string, now: Date) => {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(storefrontKeys)
    .where(and(eq(storefrontKeys.tenantId, t), isNull(storefrontKeys.revokedAt), or(isNull(storefrontKeys.expiresAt), gt(storefrontKeys.expiresAt, now))))
  return r?.n ?? 0
}

/** The live brand inside the caller's transaction (the cached loaders and the console's page share it). */
export async function shopBrandWith(tx: Tx, t: string, now: Date): Promise<(ShopBrand & { logoUrl: string | null }) | null> {
  const [[s], [row], keys, seasons] = await Promise.all([
    tx.select({ logoUrl: shopSettings.logoUrl, siteOrigin: shopSettings.siteOrigin }).from(shopSettings).where(eq(shopSettings.tenantId, t)),
    tx.select(live).from(brandTokens).where(eq(brandTokens.tenantId, t)),
    liveKeysWith(tx, t, now),
    // Not ended: a season still to start is kept so the cached copy can begin it at its boundary (liveSeason decides at
    // render; the drain's boundary sweep purges then). Fifty at most: no store needs more.
    tx.select({ id: brandSeasons.id, name: brandSeasons.name, startsAt: brandSeasons.startsAt, endsAt: brandSeasons.endsAt, accent: brandSeasons.colorAccent, on: brandSeasons.colorOn })
      .from(brandSeasons).where(and(eq(brandSeasons.tenantId, t), or(isNull(brandSeasons.endsAt), gt(brandSeasons.endsAt, now)))).orderBy(asc(brandSeasons.startsAt)).limit(50),
  ])
  if (!s || !hasCodeSite({ siteOrigin: s.siteOrigin, liveKeys: keys })) return null
  const record = recordOf(row, s.logoUrl)
  return {
    record: record ?? emptyRecord(DEFAULT_PALETTE, s.logoUrl), saved: !!record, logoUrl: s.logoUrl,
    seasons: seasons.map((x) => ({ id: x.id, name: x.name, startsAt: x.startsAt.toISOString(), endsAt: x.endsAt?.toISOString() ?? null, accent: x.accent as Hex, on: x.on as Hex })),
  }
}

const coreBrand = (t: string): Promise<ShopBrand | null> => withTenant(t, async (tx) => {
  const b = await shopBrandWith(tx, t, new Date())
  return b ? { record: b.record, saved: b.saved, seasons: b.seasons } : null
})

/** Checkout, emails, documents, share cards: the live brand, 60 s or until `shop:<t>:settings` is purged. */
export const shopBrand = shopCached('shop-brand-v1', 'settings', coreBrand)
/** The Storefront API's test tree (dynamic): the same live read, uncached. A test key never sees a waiting change. */
export const previewBrand = coreBrand
/** The Storefront API's live tree: the same read at the API's hour (M5). */
export const apiBrand = shopCached('api-brand-v1', 'settings', coreBrand, 3600)

// ── Console › Brand ───────────────────────────────────────────────────────────────────────────────────────────────

export type WaitingChange = { id: string; record: BrandRecord; summary: string; proposedBy: string; proposedAt: string; baseVersion: number }
export type BrandPage = {
  brand: ShopBrand | null
  version: number | null
  /** The store is open now: a partner's save waits for the owner (O17). */
  open: boolean
  waiting: WaitingChange | null
  /** Undo is offered to whoever saved last, while the record before it is kept. */
  lastSave: { by: string | null; at: string; undoable: boolean } | null
  /** Who sent the waiting change, as the store's people list names them (a partner's business name). */
  proposer: string | null
  /** The invoice preview's own facts (never a cost). */
  paper: { legalName: string; address: string; gstin: string | null; prefix: string }
}

/** Everything Console › Brand draws, in one snapshot. */
export const brandPage = (t: string, now: Date) => withTenant(t, async (tx): Promise<BrandPage> => {
  const [brand, [meta], [open], [w], people] = await Promise.all([
    shopBrandWith(tx, t, now),
    tx.select({ version: brandTokens.version, by: brandTokens.updatedBy, at: brandTokens.updatedAt, previous: sql<boolean>`${brandTokens.previous} is not null` }).from(brandTokens).where(eq(brandTokens.tenantId, t)),
    tx.select({ at: shopSettings.publishedAt, legalName: shopSettings.legalName, address: shopSettings.address, gstin: shopSettings.gstin, prefix: shopSettings.orderPrefix }).from(shopSettings).where(eq(shopSettings.tenantId, t)),
    tx.select({ id: brandProposals.id, record: brandProposals.record, summary: brandProposals.summary, by: brandProposals.proposedBy, at: brandProposals.proposedAt, base: brandProposals.baseVersion })
      .from(brandProposals).where(and(eq(brandProposals.tenantId, t), isNull(brandProposals.decidedAt))).limit(1),
    tx.execute<{ user_id: string; partner_name: string | null }>(sql`select user_id, partner_name from app_shop_people()`),
  ])
  const rec = w ? readRecord(w.record) : null
  const proposer = w ? [...people].find((p) => p.user_id === w.by)?.partner_name ?? null : null
  return {
    brand: brand ? { record: brand.record, saved: brand.saved, seasons: brand.seasons } : null,
    version: meta?.version ?? null,
    open: !!open?.at,
    waiting: w && rec ? { id: w.id, record: rec, summary: w.summary, proposedBy: w.by, proposedAt: w.at.toISOString(), baseVersion: w.base } : null,
    lastSave: meta ? { by: meta.by, at: meta.at.toISOString(), undoable: meta.previous } : null,
    proposer,
    paper: { legalName: open?.legalName ?? '', address: open?.address ?? '', gstin: open?.gstin ?? null, prefix: open?.prefix ?? '' },
  }
}, { snapshot: true })

/** The preview's sample product: the store's own first listed product with a photo (reconciliation 2), from the cached
 *  catalogue the store's pages read; null when it has none (the preview then shows the store's name only). */
export async function brandSample(t: string, now: Date): Promise<{ title: string; price: number; mrp: number | null; photo: string | null } | null> {
  const cat = await shopCatalogue(t)
  const p = cat.products.find((x) => isListed(x, now) && x.images.length && x.variants.length) ?? cat.products.find((x) => isListed(x, now) && x.variants.length)
  if (!p) return null
  const v = p.variants[0]!
  return { title: p.title, price: v.price, mrp: v.mrp, photo: p.images[0] ? urlFor(p.images[0].base, 400) : null }
}

/** What a Builder reads of the record (as frata_builder: the live columns and logo_url only, drizzle/0155). */
export async function builderBrandWith(tx: Tx, t: string): Promise<BrandRecord> {
  const [[s], [row]] = await Promise.all([
    tx.select({ logoUrl: shopSettings.logoUrl }).from(shopSettings).where(eq(shopSettings.tenantId, t)),
    tx.select(live).from(brandTokens).where(eq(brandTokens.tenantId, t)),
  ])
  return recordOf(row, s?.logoUrl ?? null) ?? emptyRecord(DEFAULT_PALETTE, s?.logoUrl ?? null)
}
