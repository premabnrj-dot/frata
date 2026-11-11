import { pick, urlFor } from '@/domains/media/sizes'
import { swatchBackground } from '@/domains/media/swatch'

export type SwatchColour = { value: string; hex: string | null; cropImageId: string | null; crop: { x: number; y: number; r: number } | null }
export type SwatchImage = { id: string; base: string; widths: number[]; width: number; height: number }

/** A round swatch: cut from a photo, a plain colour, or the colour's initial. Decorative: the name is always written beside it.
 *  Styled by .store-sw (base.css): one short class, said once per swatch in the HTML and again in the RSC payload. */
export function Swatch({ c, images, d = 28 }: { c: SwatchColour; images: SwatchImage[]; d?: number }) {
  const img = c.cropImageId && c.crop ? images.find((p) => p.id === c.cropImageId) : undefined
  if (img && c.crop) {
    const b = swatchBackground(c.crop, img.width, img.height, d)
    return <span aria-hidden="true" className="store-sw" style={{ width: d, height: d, backgroundImage: `url(${urlFor(img.base, pick(img.widths, 400))})`, backgroundSize: b.size, backgroundPosition: b.position }} />
  }
  if (c.hex) return <span aria-hidden="true" className="store-sw" style={{ width: d, height: d, background: c.hex }} />
  return <span aria-hidden="true" className="store-sw store-sw-i" style={{ width: d, height: d }}>{c.value.slice(0, 1)}</span>
}
