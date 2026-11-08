import Link from 'next/link'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import type { PolicyFacts } from '@/domains/policies/render'
import { classicFromSettings, schemeVars } from '@/domains/themes/resolve'
import type { ResolvedTheme } from '@/domains/themes/types'
import { POLICY_TITLE } from './policy'
import { BagButton } from './bag'

export type Href = (path: string) => string
export type ShellShop = PolicyFacts & { slug: string; accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string; nav: { handle: string; title: string }[] }

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`
const igLink = (h: string) => `https://instagram.com/${h.replace(/^@/, '')}`

/** Every shop page: the theme's tokens and display face, header, footer. Props only. T0: Classic from the shop's settings. */
export function ShopShell({ shop, href, banner, children, gated = false, live = false, theme }: { shop: ShellShop; href: Href; banner?: React.ReactNode; children: React.ReactNode; gated?: boolean; live?: boolean; theme?: ResolvedTheme }) {
  const t = theme ?? classicFromSettings(shop.accent, shop.displayFont)
  return (
    <div data-store-theme="" className={`${STORE_FONT_VARS} flex min-h-dvh flex-col`} style={{ ...schemeVars(t), '--store-display': displayFamily(t.settings.pairing) } as React.CSSProperties}>
      {banner}
      <header className="border-b border-store-line">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href={href('/')} className="mr-auto text-lg font-semibold tracking-[0.12em] sm:text-xl" style={{ fontFamily: 'var(--store-display)' }}>
            {shop.logoUrl ? <img src={shop.logoUrl} alt={shop.shopName} className="h-8 w-auto" /> : shop.shopName.toUpperCase()}
          </Link>
          {!gated && <nav aria-label="Shop" className="-mr-2 flex gap-1 overflow-x-auto text-sm">
            <Link href={href('/products')} className="whitespace-nowrap px-2 py-2">Shop all</Link>
            {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="hidden whitespace-nowrap px-2 py-2 sm:inline">{c.title}</Link>)}
            {live && <BagButton checkoutHref={href('/checkout')} shopHref={href('/products')} />}
          </nav>}
        </div>
        {!gated && shop.nav.length > 0 && (
          <nav aria-label="Collections" className="flex gap-1 overflow-x-auto border-t border-store-line px-2 text-sm sm:hidden">
            {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="whitespace-nowrap px-2 py-2.5">{c.title}</Link>)}
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">{children}</main>
      <ShopFooter f={shop} href={href} />
    </div>
  )
}

/** The footer on every page (inside the shell, which sets --store-display). */
export function ShopFooter({ f, href }: { f: ShellShop; href: Href }) {
  return (
    <footer className="mt-16 border-t border-store-line bg-store-chip/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <p className="text-lg" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
          {f.tagline && <p className="text-store-sub">{f.tagline}</p>}
          <p className="flex gap-4">
            {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
            {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
          </p>
        </div>
        <nav aria-label="Policies"><ul className="space-y-1.5">
          {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{POLICY_TITLE[k]}</Link></li>)}
        </ul></nav>
        <div className="space-y-1 text-store-sub">
          {f.legalName && <p>{f.legalName}</p>}
          {f.address && <p className="whitespace-pre-line">{f.address}</p>}
          {f.grievanceName && <p>Grievance officer: {f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
        </div>
      </div>
    </footer>
  )
}
