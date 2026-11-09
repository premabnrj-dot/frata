import Link from 'next/link'
import { schemeVars } from '@/domains/themes/resolve'
import type { SectionInstance } from '@/domains/themes/sections'
import type { ResolvedTheme } from '@/domains/themes/types'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { StoreShop } from '@/lib/queries/storefront'
import type { Href } from '../shell'

// The section library's shared pieces (split from sections/index.tsx for theme Signal, plan S1-2; no visible change).

export const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'
export const pad = 'py-[calc(var(--store-space)*2.5rem)] sm:py-[calc(var(--store-space)*3.5rem)]'
export const rupees = (p: number) => formatInr(paise(p))
/** Heading text at the theme's size (100% of the class's size for Regular). */
export const Sized = ({ children }: { children: React.ReactNode }) => <span className="[font-size:calc(var(--store-h-scale)*100%)]">{children}</span>
export const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="text-xl" style={{ fontFamily: 'var(--store-display)' }}><Sized>{children}</Sized></h2>

/** A section's label above its heading (theme Signal): shown only where the theme offers labels (globals.css). */
export const Label = ({ text }: { text: string }) => (text ? <span className="store-label">{text}</span> : null)

export const said = (b: { from: 'shopName' | 'tagline' } | { text: string } | undefined, shop: StoreShop) =>
  !b ? '' : 'text' in b ? b.text : b.from === 'shopName' ? shop.shopName : shop.tagline

/** A section painted in a scheme other than the page's sets its own colour tokens. */
export function Paint({ s, theme, children }: { s: SectionInstance; theme: ResolvedTheme; children: React.ReactNode }) {
  if (s.scheme === 'paper') return <>{children}</>
  return <div className="bg-store-paper text-store-ink" style={schemeVars(theme, s.scheme) as React.CSSProperties}>{children}</div>
}

export function Button({ b, href }: { b: { label: string; link: string } | null; href: Href }) {
  if (!b || !b.label) return null
  return <Link href={href(b.link)} className="store-btn inline-flex min-h-11 items-center rounded-[var(--store-radius)] bg-store-button px-5 text-sm font-medium text-store-on-button">{b.label}</Link>
}
