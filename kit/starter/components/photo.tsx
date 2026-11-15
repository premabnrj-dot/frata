import type { Image } from '@/lib/frrata'

/** A Frrata photo: finished URLs per width as srcset, the shape from its own size (no layout shift). */
export function Photo({ image, sizes, priority = false }: { image: Image | null; sizes: string; priority?: boolean }) {
  if (!image) return <div className="ph" aria-hidden="true" />
  const last = image.sizes[image.sizes.length - 1]!
  return <img src={last.url} srcSet={image.sizes.map((s) => `${s.url} ${s.width}w`).join(', ')} sizes={sizes} alt={image.alt}
    width={image.width} height={image.height} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} />
}
