import type { Brand } from '@/lib/frrata'

// <BrandStyle brand={shop.brand} />: the store's brand record as CSS variables on :root, and its two Google Fonts
// families. Put it once in app/layout.tsx. Every colour and font in this site's CSS reads these variables (npm run
// check fails a hex colour, rgb(), hsl() or a font family anywhere else). The brand changes them in Console › Brand.
// The defaults below are only for a store with no brand record yet: they are not the brand's look.

const DEFAULT: Brand['colours'] = { background: '#FFFFFF', panel: '#F6F5F3', text: '#171615', secondaryText: '#67625C', accent: '#171615', onAccent: '#FFFFFF',
  controlEdge: '#8F8A84', hairline: '#E3E1DD', success: '#1A6B43', warning: '#85500B', error: '#A82828' }
const FIELD: Record<string, number> = { compact: 44, standard: 48, roomy: 52 }
const SAFE_FAMILY = /^[A-Za-z0-9 ]{1,60}$/
const SAFE_HEX = /^#[0-9A-F]{6}$/

const family = (f: string, fallback: string) => (SAFE_FAMILY.test(f) ? `'${f}', ${fallback}` : fallback)
const fontsHref = (b: Brand) => {
  const fams = [...new Set([b.fonts.headings, b.fonts.body])].filter((f) => SAFE_FAMILY.test(f))
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600`).join('&')}&display=swap` : null
}

export function BrandStyle({ brand }: { brand: Brand | null | undefined }) {
  const c = { ...DEFAULT, ...(brand ? Object.fromEntries(Object.entries(brand.colours).filter(([, v]) => SAFE_HEX.test(v))) : {}) }
  const radius = brand && Number.isInteger(brand.radius) && brand.radius >= 0 && brand.radius <= 64 ? brand.radius : 8
  const field = FIELD[brand?.density ?? 'standard'] ?? 48
  const css = `:root{--brand-background:${c.background};--brand-panel:${c.panel};--brand-text:${c.text};--brand-secondary-text:${c.secondaryText};` +
    `--brand-accent:${c.accent};--brand-on-accent:${c.onAccent};--brand-control-edge:${c.controlEdge};--brand-hairline:${c.hairline};` +
    `--brand-success:${c.success};--brand-warning:${c.warning};--brand-error:${c.error};--brand-radius:${radius}px;--brand-field:${field}px;` +
    `--brand-headings:${brand ? family(brand.fonts.headings, 'Georgia, serif') : 'Georgia, serif'};--brand-body:${brand ? family(brand.fonts.body, 'system-ui, sans-serif') : 'system-ui, sans-serif'}}`
  const href = brand ? fontsHref(brand) : null
  return (
    <>
      {href && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
      {href && <link rel="stylesheet" href={href} />}
      <style>{css}</style>
    </>
  )
}
