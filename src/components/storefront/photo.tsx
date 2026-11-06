import { pick, srcSet, urlFor } from '@/domains/media/sizes'

export type PhotoData = { base: string; widths: number[]; width: number; height: number; alt?: string }

/**
 * A product photo from the 1A size ladder (400–1600 WebP on Blob): the browser
 * picks the width. `priority` for the one photo that is the page's largest
 * paint; the rest load lazily. No next/image optimiser: the sizes already exist.
 */
export function Photo({ p, sizes, alt, priority = false, className = '' }: { p: PhotoData; sizes: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <img src={urlFor(p.base, pick(p.widths, 800))} srcSet={srcSet(p.base, p.widths)} sizes={sizes} alt={alt} width={p.width} height={p.height}
      loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" className={className} />
  )
}
