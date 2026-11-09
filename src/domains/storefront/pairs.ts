import { availability, visibility, type Status } from '@/domains/catalogue/availability'
import { pairAction } from '@/domains/catalogue/stories'
import { factsOf, type ListVariant } from '@/domains/storefront/listing'
import { offerFor } from '@/domains/seo/tags'

// Signal S3: which paired pieces "Pair it with" shows, and how. Pure, so the shop's rule is tested once: a piece a
// shopper can open and buy now (live or unlisted; a scheduled drop goes live by the clock; drafts never arrive),
// with a priced variant they can buy; its price is the offer's (the lowest they can buy at now); Add only with no
// options and one variant, else Choose (its page).
export type PairPiece = { id: string; handle: string; title: string; status: string; publishAt: string | null; options: string[]; variants: (ListVariant & { id: string })[] }
export type PairRow<P extends PairPiece> = { piece: P; price: number; act: 'add' | 'choose'; variantId: string }

export function pairRowsOf<P extends PairPiece>(pairs: P[], now: Date): PairRow<P>[] {
  return pairs.flatMap((q) => {
    if (!visibility(q.status as Status, q.publishAt ? new Date(q.publishAt) : null, now).canBuy) return []
    const buyable = q.variants.filter((v) => v.price > 0 && availability(factsOf(v), now).canBuy)
    const offer = offerFor(q, now)
    return buyable.length && offer ? [{ piece: q, price: offer.pricePaise, act: pairAction({ options: q.options, variants: q.variants.length }), variantId: buyable[0]!.id }] : []
  })
}
