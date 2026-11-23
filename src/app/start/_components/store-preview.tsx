/** The store drawing itself beside the questions (mockup § 1 `.pv`): decorative, so hidden from assistive tech; the
 *  name and the address are only ever text here. The first picked category paints it (`data-sell`, signup.css). */
export function StorePreview({ name, slug, shopDomain, sell }: { name: string; slug: string; shopDomain: string; sell: string | null }) {
  return (
    <div className="su-pv" aria-hidden="true">
      <div className="su-store" data-sell={sell ?? undefined}>
        <div className="su-store-url">{slug || 'your-brand'}.{shopDomain}</div>
        <div className="su-store-nm">{name.trim()}</div>
        <div className="su-store-hero" />
        <div className="su-store-g"><i /><i /><i /></div>
        <div className="su-store-soon">Opening soon</div>
      </div>
      <div className="su-sweep" data-sweep />
    </div>
  )
}
