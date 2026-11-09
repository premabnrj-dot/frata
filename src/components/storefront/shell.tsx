import Link from 'next/link'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import type { PolicyFacts } from '@/domains/policies/render'
import { classicFromSettings, schemeVars, settingAttrs, settingVars } from '@/domains/themes/resolve'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { MenuItem } from '@/domains/themes/site'
import { ShopIcon, type IconSet } from './icon'
import { FooterMenu } from './nav'
import { CaptureAttribution } from './capture'
import { wordsFor, type Lang, type Words } from './words'
import type { PhotoData } from './photo'
import { CircleRow, ClassicHeader, Logo, MenuHeader, SplitHeader } from './headers'
import { ShopFooter } from './footers'
export { ShopFooter } from './footers'

export type Href = (path: string) => string
export type ShellShop = PolicyFacts & { shopLanguage?: Lang; slug: string; accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string; nav: { handle: string; title: string }[] }


export type Circle = { handle: string; title: string; image: PhotoData | null }
export type StripPiece = { handle: string; title: string; image: PhotoData }

/** Every shop page: the theme's tokens, settings and display face, its header and footer. Props only.
 *  No theme passed: Classic from the shop's settings (the look every shop had before themes). */
export function ShopShell({ shop, href, banner, children, gated = false, live = false, capture = false, theme, circles = [], strip = [], focused = false }: { shop: ShellShop; href: Href; banner?: React.ReactNode; children: React.ReactNode; gated?: boolean; live?: boolean
  /** Record how the shopper arrived (Analytics A·1): the real shop only, never a console preview (which may be `live`). */
  capture?: boolean; theme?: ResolvedTheme; circles?: Circle[]
  /** The Instagram strip footer's pieces (newest first, ≤ 6): each its first photo and its page. */
  strip?: StripPiece[]
  /** The focused checkout (2.0 choice): the logo and the legal footer only; no menu, announcement, tabs or social links. */
  focused?: boolean }) {
  const t = theme ?? classicFromSettings(shop.accent, shop.displayFont)
  const s = t.settings
  const bare = gated || focused
  const tabs = s.bottomTabs && !bare
  const w = wordsFor(shop.shopLanguage)
  // Look v4: the shop's icon set, and the merchant's own main menu (none: the collections, exactly as before menus).
  const set = t.site.icons
  const own = t.menus.main ?? null
  const hp = { shop, href, gated, live, w, set, own }
  return (
    <div data-store-theme="" lang={shop.shopLanguage === 'hi' ? 'hi' : undefined} {...settingAttrs(t)} className={`${STORE_FONT_VARS} flex min-h-dvh flex-col`} style={{ ...settingVars(t), '--store-display': displayFamily(s.pairing) } as React.CSSProperties}>
      {!focused && (banner ?? (s.announcement && !gated && <Announcement a={s.announcement} t={t} href={href} />))}
      <header className={`border-b border-store-line ${s.sticky && !focused ? 'sticky top-0 z-30 bg-store-paper' : ''}`}>
        {focused ? <div className="mx-auto flex max-w-6xl justify-center px-4 py-4 sm:px-6"><Logo shop={shop} href={href} upper={s.header === 'minimal' || s.headings === 'upper'} className="text-lg font-semibold tracking-[0.12em]" /></div>
          : s.header === 'centred' || s.header === 'minimal' || s.header === 'overlay'
          ? <MenuHeader {...hp} minimal={s.header === 'minimal'} />
          : s.header === 'panel' ? <MenuHeader {...hp} minimal={false} panel={circles} />
          : s.header === 'split' ? <SplitHeader {...hp} />
          : <ClassicHeader {...hp} />}
        {s.header === 'circles' && !bare && circles.length > 0 && <CircleRow circles={circles} href={href} w={w} />}
      </header>
      <main id="main" className={`flex-1 ${tabs ? 'pb-16 sm:pb-0' : ''}`}>{children}</main>
      <div style={s.footerScheme !== 'paper' ? schemeVars(t, s.footerScheme) as React.CSSProperties : undefined} className={s.footerScheme !== 'paper' ? 'contents' : undefined}>
        {!bare && t.menus.footer && t.menus.footer.length > 0 && <FooterMenu items={t.menus.footer} href={href} set={set} w={w} />}
        <ShopFooter f={shop} href={href} variant={focused ? 'compact' : s.footer} social={s.social && !focused} w={w} painted={s.footerScheme !== 'paper'} strip={strip} />
      </div>
      {tabs && <BottomTabs href={href} live={live} w={w} set={set} own={t.menus.tabs ?? null} />}
      {/* How the shopper arrived: on every page of the real shop, never in a console preview (Analytics A·1). */}
      <CaptureAttribution capture={capture} />
    </div>
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

/** Phones only: Home, Shop, Search, Bag (Search opens Shop all until a search page exists), each with its icon; or
 *  the merchant's own tabs (Look v4: 2–5, each an icon and words). */
function BottomTabs({ href, live, w, set, own }: { href: Href; live: boolean; w: Words; set: IconSet; own: MenuItem[] | null }) {
  const tab = 'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs'
  if (own && own.length) return (
    <nav aria-label={w.tabsNav} className="fixed inset-x-0 bottom-0 z-30 grid border-t border-store-line bg-store-paper sm:hidden" style={{ gridTemplateColumns: `repeat(${own.length}, minmax(0, 1fr))` }}>
      {own.map((x) => <Link key={x.id} href={href(x.link)} className={tab}>{x.icon && <ShopIcon name={x.icon} set={set} />}<span className="max-w-full truncate px-1">{x.label}</span></Link>)}
    </nav>
  )
  return (
    <nav aria-label={w.tabsNav} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-store-line bg-store-paper sm:hidden">
      <Link href={href('/')} className={tab}><ShopIcon name="home" set={set} />{w.home}</Link>
      <Link href={href('/products')} className={tab}><ShopIcon name="grid" set={set} />{w.shop}</Link>
      <Link href={href('/products')} className={tab}><ShopIcon name="search" set={set} />{w.search}</Link>
      {live ? <Link href={href('/bag')} className={tab}><ShopIcon name="bag" set={set} />{w.bag}</Link> : <span className={`${tab} text-store-sub`}><ShopIcon name="bag" set={set} />{w.bag}</span>}
    </nav>
  )
}

