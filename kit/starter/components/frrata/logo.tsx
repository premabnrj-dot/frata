import type { Brand } from '@/lib/frrata'

// <Logo brand={shop.brand} name={shop.name} />: the store's logo from its brand record, always through <img> (an SVG
// there runs nothing). `variant`: main (the header), mark (a small square), stacked (a footer or an email-like block),
// reversed (on a dark band); a variant the brand hasn't uploaded falls back to the main logo. No logo yet: the store's
// name in the headings font. Never draw the logo in code or keep its files in this site (npm run check fails both).

export function Logo({ brand, name, variant = 'main', height = 32, className, fallback = null }: {
  brand: Brand | null | undefined; name: string; variant?: keyof Brand['logos']; height?: number; className?: string
  /** shop.logo, for a store with no brand record. */
  fallback?: string | null
}) {
  const src = brand?.logos[variant] ?? brand?.logos.main ?? (brand ? null : fallback)
  if (!src) return <span className={className} style={{ fontFamily: 'var(--brand-headings)', fontSize: Math.round(height * 0.66), lineHeight: 1 }}>{name}</span>
  // eslint-disable-next-line @next/next/no-img-element -- the store's own file on Frrata's media store, through <img> only
  return <img src={src} alt={name} height={height} style={{ height, width: 'auto' }} className={className} />
}
