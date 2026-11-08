import { pick, srcSet, urlFor } from '@/domains/media/sizes'

export type PhotoData = { base: string; widths: number[]; width: number; height: number; alt?: string }

/**
 * A product photo from the 1A size ladder (400–1600 WebP on Blob): the browser
 * picks the width. `priority` for the one photo that is the page's largest
 * paint; the rest load lazily. No next/image optimiser: the sizes already exist.
 * Until it paints, and if it never does, the shopper sees a tile in the shop's chip colour with a small garment
 * drawn on it, never the browser's broken-image glyph or the alt text (globals.css `img[data-photo]`; no fade-in:
 * hiding the photo until a script saw it load would delay the page's largest paint).
 */
export function Photo({ p, sizes, alt, priority = false, className = '' }: { p: PhotoData; sizes: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <img src={urlFor(p.base, pick(p.widths, 800))} srcSet={srcSet(p.base, p.widths)} sizes={sizes} alt={alt} width={p.width} height={p.height}
      loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" data-photo className={className} />
  )
}
