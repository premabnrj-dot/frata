import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { CARD_PAPER as P } from '@/domains/seo/card-paper'
import { CARD, type CardContent } from './card'

// =============================================================================
// FILE: src/lib/seo/render-card.tsx — DRAWING A SHARE CARD (search and sharing S1·3–S1·4, layouts as the approved
// mockup). next/og draws PNG; sharp makes the JPEG every app reads (ADR-0005 amended 2026-11-09), ≤ 300 KB.
// Photos reach Satori only as data URIs made here (security review: Satori would fetch a URL itself, with no timeout
// or host check): the caller fetches our own store's bytes; sharp checks they are WebP of sane size.
// =============================================================================

export const MAX_BYTES = 300_000
const FONTS = path.join(process.cwd(), 'src/lib/documents/fonts')
let fonts: { name: string; data: Buffer; weight: 400 | 600 }[] | null = null
async function fontsFor() {
  if (fonts) return fonts
  const f = (file: string) => readFile(path.join(FONTS, file))
  // Inter for the words; Noto Devanagari only for the rupee sign (no Hindi words are drawn: no shaping).
  fonts = [
    { name: 'Inter', data: await f('inter-latin-400-normal.woff'), weight: 400 },
    { name: 'Inter', data: await f('inter-latin-600-normal.woff'), weight: 600 },
    { name: 'Noto', data: await f('noto-sans-devanagari-devanagari-400-normal.woff'), weight: 400 },
    { name: 'Noto', data: await f('noto-sans-devanagari-devanagari-600-normal.woff'), weight: 600 },
  ]
  return fonts
}

/** A photo's bytes → a JPEG data URI cropped to the box, or null for anything that is not a sane WebP. */
export async function photoUri(bytes: Buffer, w: number, h: number): Promise<string | null> {
  try {
    const img = sharp(bytes, { limitInputPixels: 4_000_000, failOn: 'error' })
    if ((await img.metadata()).format !== 'webp') return null
    const out = await img.resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch { return null }
}

const FAMILY = 'Inter, Noto'

function Band({ c }: { c: CardContent }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: P.band, color: P.onBand, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px' }}>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, maxWidth: 520, overflow: 'hidden' }}>{c.shopName ?? ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {c.soldOut ? <div style={{ display: 'flex', fontSize: 30, fontWeight: 600 }}>Sold out</div> : null}
        {!c.soldOut && c.cod ? <div style={{ display: 'flex', fontSize: 24, border: `2px solid ${P.chipLine}`, borderRadius: 999, padding: '6px 18px' }}>Pay on delivery</div> : null}
        {c.mrp && !c.soldOut ? <div style={{ display: 'flex', fontSize: 26, opacity: 0.8 }}>{`M.R.P. ${c.mrp}`}</div> : null}
        {c.price && !c.soldOut ? <div style={{ display: 'flex', fontSize: 54, fontWeight: 600 }}>{c.price}</div> : null}
      </div>
    </div>
  )
}

function Layout({ c, photos }: { c: CardContent; photos: string[] }) {
  const { bg, text, sub } = c.colours
  const page = { width: CARD.width, height: CARD.height, display: 'flex', position: 'relative' as const, fontFamily: FAMILY, background: bg, color: text }
  if (c.kind === 'product' && photos[0]) {
    return <div style={page}><img src={photos[0]} width={CARD.width} height={CARD.height} style={{ objectFit: 'cover' }} /><Band c={c} /></div>
  }
  if (c.kind === 'collection' && photos.length) {
    const [big, ...small] = photos
    return (
      <div style={{ ...page, gap: 6, background: P.gap }}>
        <div style={{ display: 'flex', position: 'relative', width: 790, height: CARD.height }}>
          <img src={big} width={790} height={CARD.height} style={{ objectFit: 'cover' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '32px 40px', background: P.band, color: P.onBand, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 600 }}>{c.title ?? ''}</div>
            {c.line ? <div style={{ display: 'flex', fontSize: 28 }}>{c.line}</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 404 }}>
          {small.slice(0, 3).map((s, i) => <img key={i} src={s} width={404} height={206} style={{ objectFit: 'cover' }} />)}
        </div>
      </div>
    )
  }
  // The shop card (and the fallback for a page with no photo): the name on the theme's colour, up to three photos.
  const name = c.kind === 'shop' ? c.shopName : c.title
  return (
    <div style={{ ...page, alignItems: 'center', padding: '0 64px', gap: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 600, lineHeight: 1.1 }}>{name ?? ''}</div>
        {c.kind !== 'shop' && c.shopName ? <div style={{ display: 'flex', fontSize: 30, color: sub }}>{c.shopName}</div> : null}
        {c.line ? <div style={{ display: 'flex', fontSize: 28, color: sub }}>{c.line}</div> : null}
        {c.price ? <div style={{ display: 'flex', fontSize: 48, fontWeight: 600 }}>{c.soldOut ? 'Sold out' : c.price}</div> : null}
      </div>
      {photos.slice(0, 3).map((s, i) => <img key={i} src={s} width={200} height={268} style={{ objectFit: 'cover', borderRadius: 10 }} />)}
    </div>
  )
}

/** The card as a JPEG ≤ 300 KB (quality stepped down from 80), or null if it cannot be made that small. */
export async function renderCard(c: CardContent, photos: string[]): Promise<Buffer | null> {
  const png = Buffer.from(await new ImageResponse(<Layout c={c} photos={photos} />, { ...CARD, fonts: await fontsFor() }).arrayBuffer())
  for (const quality of [80, 72, 64, 56]) {
    const jpg = await sharp(png).flatten({ background: P.gap }).toColourspace('srgb').jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer()
    if (jpg.length <= MAX_BYTES) return jpg
  }
  return null
}
