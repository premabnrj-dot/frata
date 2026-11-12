import 'server-only'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { barText, bxgyText, offOf, offerTerms } from '@/domains/checkout/offer-text'
import type { ShowOffer } from '@/domains/checkout/offer-showcase'
import { collectionMembersIn } from '@/lib/catalogue/collection-members'
import type { Tx } from '@/lib/db'
import { usedUpIds } from '@/lib/db/discount-predicates'
import { discountCodes, discountTargets, discountTiers, discounts } from '@/lib/db/schema-discounts'

// =============================================================================
// FILE: src/lib/storefront/showcase.ts — what a shop's cached pages show of its offers (offers O·2): card badges and the
// product page's lines. Read inside the catalogue's and a product's own transaction (src/lib/queries/storefront.ts).
// =============================================================================

/**
 * The shop's started, unended, listed offers as the showcase reads them (offers O·2): words and timestamps only, never
 * a limit, budget or count (ADR-0003). Product offers carry the products they cover (collections resolved now).
 */
export type Showcase = { shop: ShowOffer[]; byProduct: (id: string) => ShowOffer[]; product: ShowOffer[]; indexFor: (id: string) => number[] }
export async function showcase(tx: Tx, tenantId: string): Promise<Showcase> {
  const found = await tx.select({
    id: discounts.id, title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal,
    targets: discounts.targets, buyQty: discounts.buyQty, getQty: discounts.getQty, getBps: discounts.getBps, firstOrder: discounts.firstOrder, code: discountCodes.code,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt,
    limitTotal: discounts.limitTotal, budget: discounts.budget,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), sql`${discounts.startedAt} is not null and ${discounts.endedAt} is null and ${discounts.listed}`))
  // An offer used up for everyone (its total limit or budget: usedUp, what placement counts) is not shown; a per-phone
  // limit is the shopper's own and can't be known here (shopper batch 2026-11-12). Counted when the entry fills:
  // placing the order that uses one up purges these pages (place.ts → refreshSoldOut); a use given back (a lapsed hold,
  // a cancel) shows within the 60 s backstop. The limit and budget never leave this function (ADR-0003).
  const gone = await usedUpIds(tx, tenantId, found, new Date())
  const rows = found.filter((r) => !gone.has(r.id))
  if (!rows.length) return { shop: [], byProduct: () => [], product: [], indexFor: () => [] }
  const tiers = await tx.select({ discountId: discountTiers.discountId, min: discountTiers.minSubtotal, percentBps: discountTiers.percentBps, amountOff: discountTiers.amountOff }).from(discountTiers)
    .where(and(eq(discountTiers.tenantId, tenantId), inArray(discountTiers.discountId, rows.map((r) => r.id)))).orderBy(asc(discountTiers.minSubtotal))
  const narrowed = rows.filter((r) => r.targets !== 'all').map((r) => r.id)
  const targets = narrowed.length ? await tx.select({ discountId: discountTargets.discountId, productId: discountTargets.productId, collectionId: discountTargets.collectionId }).from(discountTargets)
    .where(and(eq(discountTargets.tenantId, tenantId), inArray(discountTargets.discountId, narrowed))) : []
  // In THIS transaction (speed review P4): a cached loader here opened a second connection mid-transaction.
  const members = targets.some((t) => t.collectionId) ? await collectionMembersIn(tx, tenantId) : {}
  const iso = (x: Date | null) => (x ? x.toISOString() : null)
  const all = rows.map((r) => {
    const words = { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
      targets: r.targets, buyQty: r.buyQty, getQty: r.getQty, getBps: r.getBps, firstOrder: r.firstOrder,
      tiers: tiers.filter((x) => x.discountId === r.id).map((x) => ({ min: Number(x.min), percentBps: x.percentBps, amountOff: x.amountOff === null ? null : Number(x.amountOff) })) }
    const product = r.style === 'product_off' || r.style === 'bxgy'
    const label = (r.style === 'pay_online' ? barText(words, { code: null, endsAt: null }) : offerTerms(words)) + (r.code && !product ? ` · code ${r.code.toUpperCase()}` : '')
    return {
      offer: { label: product ? `${r.title}: ${offerTerms({ ...words, targets: 'all' })}` : label, badge: r.style === 'bxgy' ? bxgyText(words) : r.style === 'product_off' ? offOf(words, false) : null, product,
        startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt), stoppedAt: iso(r.stoppedAt) } satisfies ShowOffer,
      covers: !product ? null : r.targets === 'all' ? 'all' as const : new Set(targets.filter((t) => t.discountId === r.id).flatMap((t) => (t.productId ? [t.productId] : members[t.collectionId!] ?? []))),
    }
  })
  const productOffers = all.filter((a) => a.covers !== null)
  const indexFor = (id: string) => productOffers.flatMap((a, i) => (a.covers === 'all' || (a.covers instanceof Set && a.covers.has(id)) ? [i] : []))
  return {
    shop: all.filter((a) => a.covers === null).map((a) => a.offer),
    byProduct: (id) => indexFor(id).map((i) => productOffers[i]!.offer),
    product: productOffers.map((a) => a.offer),
    indexFor,
  }
}
