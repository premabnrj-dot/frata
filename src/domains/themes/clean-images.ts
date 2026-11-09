import { acceptedBase } from '@/domains/media/sizes'
import { SectionSchema } from './sections'

/**
 * Every photo a look's sections name, rebuilt by acceptedBase for THIS shop's theme folder — or its product photos
 * (Look v3: "From your products"); a photo from anywhere else refuses the save (null). `host` is the shop photos' Blob
 * host (storeHost of the store id; none = every photo refused). Pure, so the refusal is tested per section
 * (security review S2, 2026-11-09).
 */
export function cleanImages<L extends { home?: unknown[] }>(layer: L, tenantId: string, host: string | null): L | null {
  const fix = (img: { base: string } | null | undefined) => {
    if (!img) return img
    const base = host ? acceptedBase(img.base, host, tenantId, 'theme') ?? acceptedBase(img.base, host, tenantId, 'products') : null
    if (!base) throw new Error('image')
    return { ...img, base }
  }
  try {
    const home = layer.home?.map((raw) => {
      const p = SectionSchema.safeParse(raw)
      if (!p.success) throw new Error('section')
      const s = p.data
      // Exhaustive: a new section with a photo can't be missed (tenancy audit 2026-11-08: Shop the look was).
      switch (s.key) {
        case 'hero': case 'image_text': case 'drop_teaser': case 'shop_the_look': case 'statement': return { ...s, image: fix(s.image) }
        case 'story_fan': return { ...s, cards: s.cards.map((c) => ({ ...c, image: fix(c.image) ?? null })) }
        case 'logos': return { ...s, images: s.images.map((i) => fix(i)!) }
        case 'collection_tiles': case 'products': case 'price_tiles': case 'promises': case 'rich_text': return s
        default: return s satisfies never
      }
    })
    return { ...layer, ...(home ? { home } : {}) }
  } catch { return null }
}
