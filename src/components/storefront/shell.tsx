import Link from 'next/link'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import type { PolicyFacts } from '@/domains/policies/render'
import { classicFromSettings, schemeVars, settingAttrs, settingVars } from '@/domains/themes/resolve'
import type { ResolvedTheme } from '@/domains/themes/types'
import { BagButton } from './bag'
import { wordsFor, type Lang, type Words } from './words'
import { Photo, type PhotoData } from './photo'

export type Href = (path: string) => string
export type ShellShop = PolicyFacts & { shopLanguage?: Lang; slug: string; accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string; nav: { handle: string; title: string }[] }

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`
const igLink = (h: string) => `https://instagram.com/${h.replace(/^@/, '')}`

export type Circle = { handle: string; title: string; image: PhotoData | null }

/** Every shop page: the theme's tokens, settings and display face, its header and footer. Props only.
 *  No theme passed: Classic from the shop's settings (the look every shop had before themes). */
export function ShopShell({ shop, href, banner, children, gated = false, live = false, theme, circles = [] }: { shop: ShellShop; href: Href; banner?: React.ReactNode; children: React.ReactNode; gated?: boolean; live?: boolean; theme?: ResolvedTheme; circles?: Circle[] }) {
  const t = theme ?? classicFromSettings(shop.accent, shop.displayFont)
  const s = t.settings
  const tabs = s.bottomTabs && !gated
  const w = wordsFor(shop.shopLanguage)
  return (
    <div data-store-theme="" lang={shop.shopLanguage === 'hi' ? 'hi' : undefined} {...settingAttrs(t)} className={`${STORE_FONT_VARS} flex min-h-dvh flex-col`} style={{ ...settingVars(t), '--store-display': displayFamily(s.pairing) } as React.CSSProperties}>
      {banner ?? (s.announcement && !gated && <Announcement a={s.announcement} t={t} href={href} />)}
      <header className={`border-b border-store-line ${s.sticky ? 'sticky top-0 z-30 bg-store-paper' : ''}`}>
        {s.header === 'centred' || s.header === 'minimal'
          ? <MenuHeader shop={shop} href={href} gated={gated} live={live} minimal={s.header === 'minimal'} w={w} />
          : <ClassicHeader shop={shop} href={href} gated={gated} live={live} w={w} />}
        {s.header === 'circles' && !gated && circles.length > 0 && <CircleRow circles={circles} href={href} w={w} />}
      </header>
      <main id="main" className={`flex-1 ${tabs ? 'pb-16 sm:pb-0' : ''}`}>{children}</main>
      <ShopFooter f={shop} href={href} variant={s.footer} social={s.social} w={w} />
      {tabs && <BottomTabs href={href} live={live} w={w} />}
    </div>
  )
}

const Logo = ({ shop, href, className, upper = true }: { shop: ShellShop; href: Href; className: string; upper?: boolean }) => (
  <Link href={href('/')} className={className} style={{ fontFamily: 'var(--store-display)' }}>
    {shop.logoUrl ? <img src={shop.logoUrl} alt={shop.shopName} className="h-8 w-auto" /> : upper ? shop.shopName.toUpperCase() : shop.shopName}
  </Link>
)

/** Today's header, exactly. */
function ClassicHeader({ shop, href, gated, live, w }: { shop: ShellShop; href: Href; gated: boolean; live: boolean; w: Words }) {
  return (
    <>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Logo shop={shop} href={href} className="mr-auto text-lg font-semibold tracking-[0.12em] sm:text-xl" />
        {!gated && <nav aria-label={w.shopNav} className="-mr-2 flex gap-1 overflow-x-auto text-sm">
          <Link href={href('/products')} className="whitespace-nowrap px-2 py-2">{w.shopAll}</Link>
          {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="hidden whitespace-nowrap px-2 py-2 sm:inline">{c.title}</Link>)}
          {live && <BagButton checkoutHref={href('/checkout')} shopHref={href('/products')} label={w.bag} />}
        </nav>}
      </div>
      {!gated && shop.nav.length > 0 && (
        <nav aria-label={w.collectionsNav} className="flex gap-1 overflow-x-auto border-t border-store-line px-2 text-sm sm:hidden">
          {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="whitespace-nowrap px-2 py-2.5">{c.title}</Link>)}
        </nav>
      )}
    </>
  )
}

/** Centred logo (or Minimal: tracked, uppercase): a menu on the left that opens with no script (<details>). */
function MenuHeader({ shop, href, gated, live, minimal, w }: { shop: ShellShop; href: Href; gated: boolean; live: boolean; minimal: boolean; w: Words }) {
  return (
    <>
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:px-6">
        <div>
          {!gated && (
            <details className="relative">
              <summary aria-label={w.menu} className="grid size-11 cursor-pointer list-none place-items-center text-xl [&::-webkit-details-marker]:hidden">≡</summary>
              <nav aria-label={w.menu} className="absolute left-0 top-12 z-40 w-64 space-y-1 rounded-[var(--store-radius)] border border-store-line bg-store-paper p-3 text-base shadow-sm">
                <Link href={href('/products')} className="block py-2">{w.shopAll}</Link>
                {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="block py-2">{c.title}</Link>)}
                <Link href={href('/policies/contact')} className="block py-2 text-store-sub">{w.contact}</Link>
              </nav>
            </details>
          )}
        </div>
        <Logo shop={shop} href={href} upper={minimal} className={minimal ? 'text-sm font-bold tracking-[0.24em]' : 'text-2xl font-semibold tracking-[0.12em] sm:text-3xl'} />
        <div className="flex justify-end">{!gated && live && <BagButton checkoutHref={href('/checkout')} shopHref={href('/products')} label={w.bag} />}</div>
      </div>
      {!gated && !minimal && shop.nav.length > 0 && (
        <nav aria-label={w.collectionsNav} className="hidden justify-center gap-2 border-t border-store-line text-sm sm:flex">
          {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="px-3 py-2.5">{c.title}</Link>)}
        </nav>
      )}
    </>
  )
}

/** Category circles under the header: each collection's first photo, the Instagram-story idiom. */
function CircleRow({ circles, href, w }: { circles: Circle[]; href: Href; w: Words }) {
  return (
    <nav aria-label={w.categoriesNav} className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:px-6">
      {circles.map((c) => (
        <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="w-16 shrink-0 text-center text-xs">
          <span className="relative block aspect-square overflow-hidden rounded-full border-2 border-store-accent bg-store-chip">
            {c.image && <Photo p={c.image} alt="" sizes="64px" className="absolute inset-0 h-full w-full object-cover" />}
          </span>
          <span className="mt-1 block truncate">{c.title}</span>
        </Link>
      ))}
    </nav>
  )
}

function Announcement({ a, t, href }: { a: NonNullable<ResolvedTheme['settings']['announcement']>; t: ResolvedTheme; href: Href }) {
  const body = <span className="mx-auto block max-w-6xl px-4 py-2 text-center text-sm sm:px-6">{a.text}</span>
  return (
    <div className="bg-store-paper text-store-ink" style={(a.scheme === 'paper' ? { background: 'var(--store-accent)', color: 'var(--store-on-accent)' } : schemeVars(t, a.scheme)) as React.CSSProperties}>
      {a.link ? <Link href={href(a.link)} className="block underline-offset-4 hover:underline">{body}</Link> : body}
    </div>
  )
}

/** Phones only: Home, Shop, Search, Bag (Search opens Shop all until a search page exists). */
function BottomTabs({ href, live, w }: { href: Href; live: boolean; w: Words }) {
  const tab = 'flex min-h-14 flex-col items-center justify-center text-xs'
  return (
    <nav aria-label={w.tabsNav} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-store-line bg-store-paper sm:hidden">
      <Link href={href('/')} className={tab}>{w.home}</Link>
      <Link href={href('/products')} className={tab}>{w.shop}</Link>
      <Link href={href('/products')} className={tab}>{w.search}</Link>
      {live ? <Link href={href('/bag')} className={tab}>{w.bag}</Link> : <span className={`${tab} text-store-sub`}>{w.bag}</span>}
    </nav>
  )
}

/** The footer on every page (inside the shell, which sets --store-display). */
export function ShopFooter({ f, href, variant = 'three', social = true, w = wordsFor(f.shopLanguage) }: { f: ShellShop; href: Href; variant?: 'three' | 'compact'; social?: boolean; w?: Words }) {
  if (variant === 'compact') return <CompactFooter f={f} href={href} social={social} w={w} />
  return (
    <footer className="mt-16 border-t border-store-line bg-store-chip/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <p className="text-lg" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
          {f.tagline && <p className="text-store-sub">{f.tagline}</p>}
          {social && <p className="flex gap-4">
            {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
            {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
          </p>}
        </div>
        <nav aria-label={w.policiesNav}><ul className="space-y-1.5">
          {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{w.policy[k]}</Link></li>)}
        </ul></nav>
        <div className="space-y-1 text-store-sub">
          {f.legalName && <p>{f.legalName}</p>}
          {f.address && <p className="whitespace-pre-line">{f.address}</p>}
          {f.grievanceName && <p>{w.grievance}: {f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
        </div>
      </div>
    </footer>
  )
}

/** One column on every width. The policies, legal name, address and grievance officer stay: the law, not a setting. */
function CompactFooter({ f, href, social, w }: { f: ShellShop; href: Href; social: boolean; w: Words }) {
  return (
    <footer className="mt-16 border-t border-store-line">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-center text-sm sm:px-6">
        <p className="text-base" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
        <nav aria-label={w.policiesNav}><ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{w.policy[k]}</Link></li>)}
        </ul></nav>
        {social && (f.instagram || f.whatsapp) && <p className="flex justify-center gap-4">
          {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
          {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
        </p>}
        <p className="text-store-sub">{[f.legalName, f.address?.replace(/\n/g, ', '), f.grievanceName ? `${w.grievance}: ${f.grievanceName}${f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}` : ''].filter(Boolean).join(' · ')}</p>
      </div>
    </footer>
  )
}
