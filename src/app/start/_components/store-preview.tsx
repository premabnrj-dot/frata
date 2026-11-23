import { StoreCard } from '@/components/brand/store-card'

/** The store drawing itself beside the questions (mockup § 1 `.pv`): decorative, so hidden from assistive tech; the
 *  name and the address are only ever text here. The first picked category paints it (`data-sell`, store-card.css). */
export function StorePreview({ name, slug, shopDomain, sell }: { name: string; slug: string; shopDomain: string; sell: string | null }) {
  return (
    <div className="su-pv" aria-hidden="true">
      <StoreCard host={`${slug || 'your-brand'}.${shopDomain}`} name={name} sell={sell} />
      <div className="su-sweep" data-sweep />
    </div>
  )
}
