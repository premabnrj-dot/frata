import type { PageTags } from '@/domains/seo/tags'

/** og:type product and the product:* tags (Meta, Pinterest), as property= meta tags; React hoists them into <head>. */
export function ProductTags({ tags }: { tags: PageTags }) {
  if (tags.og.type !== 'product') return null
  return (
    <>
      <meta property="og:type" content="product" />
      {tags.product.map(([property, content]) => <meta key={property} property={property} content={content} />)}
    </>
  )
}
