import Link from 'next/link'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import type { PolicyFacts } from '@/domains/policies/render'
import { classicFromSettings, schemeVars, settingAttrs, settingVars } from '@/domains/themes/resolve'
import type { FooterVariant, ResolvedTheme } from '@/domains/themes/types'
import type { MenuItem } from '@/domains/themes/site'
import { BagButton } from './bag'
import { ShopIcon, type IconSet } from './icon'
import { FooterMenu, MenuDrawer, MenuRow } from './nav'
import { CaptureAttribution } from './capture'
import { wordsFor, type Lang, type Words } from './words'
import { Photo, type PhotoData } from './photo'

export type Href = (path: string) => string
export type ShellShop = PolicyFacts & { shopLanguage?: Lang; slug: string; accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string; nav: { handle: string; title: string }[] }

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`
const igLink = (h: string) => `https://instagram.com/${h.replace(/^@/, '')}`

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

const Logo = ({ shop, href, className, upper = true }: { shop: ShellShop; href: Href; className: string; upper?: boolean }) => (
  <Link href={href('/')} className={className} style={{ fontFamily: 'var(--store-display)' }}>
    {shop.logoUrl ? <img src={shop.logoUrl} alt={shop.shopName} height={32} width={128} className="h-8 w-auto max-w-32 object-contain object-left" /> : upper ? shop.shopName.toUpperCase() : shop.shopName}
  </Link>
)

/** Today's header, exactly. */
type HeaderProps = { shop: ShellShop; href: Href; gated: boolean; live: boolean; w: Words; set: IconSet; own: MenuItem[] | null }
const Bag = ({ href, live, w, set }: HeaderProps) => live ? <BagButton checkoutHref={href('/checkout')} shopHref={href('/products')} label={w.bag} count={[w.bagOne, w.bagMany]} icon={<ShopIcon name="bag" set={set} />} /> : null
const MenuIcon = ({ set }: { set: IconSet }) => <ShopIcon name="menu" set={set} className="size-6" />

function ClassicHeader(p: HeaderProps) {
  const { shop, href, gated, live, w, set, own } = p
  return (
    <>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Logo shop={shop} href={href} className="mr-auto text-lg font-semibold tracking-[0.12em] sm:text-xl" />
        {!gated && <nav aria-label={w.shopNav} className="-mr-2 flex items-center gap-1 text-sm">
          {own ? <MenuRow items={own} href={href} set={set} className="hidden gap-1 sm:flex" link="px-2 py-2" /> : <>
            <Link href={href('/products')} className="whitespace-nowrap px-2 py-2">{w.shopAll}</Link>
            {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="hidden whitespace-nowrap px-2 py-2 sm:inline">{c.title}</Link>)}
          </>}
          {live && <Bag {...p} />}
        </nav>}
      </div>
      {!gated && own && own.length > 0 && (
        <nav aria-label={w.collectionsNav} className="flex gap-1 overflow-x-auto border-t border-store-line px-2 text-sm sm:hidden">
          {own.map((x) => <Link key={x.id} href={href(x.link)} className="inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-2.5">{x.icon && <ShopIcon name={x.icon} set={set} className="size-4" />}{x.label}</Link>)}
        </nav>
      )}
      {!gated && !own && shop.nav.length > 0 && (
        <nav aria-label={w.collectionsNav} className="flex gap-1 overflow-x-auto border-t border-store-line px-2 text-sm sm:hidden">
          {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="whitespace-nowrap px-2 py-2.5">{c.title}</Link>)}
        </nav>
      )}
    </>
  )
}

/** Centred logo (or Minimal: tracked, uppercase): a menu on the left that opens with no script (<details>).
 *  With `panel` (2.1 "Centred with a shop panel"): on a computer the collections row starts with Shop, which opens a
 *  panel of the collections' pictures. */
function MenuHeader(p: HeaderProps & { minimal: boolean; panel?: Circle[] }) {
  const { shop, href, gated, minimal, w, panel, set, own } = p
  return (
    <>
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:px-6">
        <div>
          {!gated && (
            <details className="relative">
              <summary aria-label={w.menu} className="grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden"><MenuIcon set={set} /></summary>
              <nav aria-label={w.menu} className="absolute left-0 top-12 z-40 max-h-[70dvh] w-64 space-y-1 overflow-y-auto rounded-[var(--store-radius)] border border-store-line bg-store-paper p-3 text-base shadow-sm">
                {own ? <MenuDrawer items={own} href={href} set={set} w={w} /> : <>
                  <Link href={href('/products')} className="block py-2">{w.shopAll}</Link>
                  {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="block py-2">{c.title}</Link>)}
                </>}
                <Link href={href('/policies/contact')} className="block py-2 text-store-sub">{w.contact}</Link>
              </nav>
            </details>
          )}
        </div>
        <Logo shop={shop} href={href} upper={minimal} className={minimal ? 'text-sm font-bold tracking-[0.24em]' : 'text-2xl font-semibold tracking-[0.12em] sm:text-3xl'} />
        <div className="flex justify-end">{!gated && <Bag {...p} />}</div>
      </div>
      {!gated && !minimal && own && own.length > 0 && (
        <nav aria-label={w.collectionsNav} className="relative hidden justify-center border-t border-store-line text-sm sm:flex">
          <MenuRow items={own} href={href} set={set} className="justify-center gap-2" />
        </nav>
      )}
      {!gated && !minimal && !own && shop.nav.length > 0 && (
        <nav aria-label={w.collectionsNav} className="relative hidden justify-center gap-2 border-t border-store-line text-sm sm:flex">
          {panel && panel.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none px-3 py-2.5 font-medium [&::-webkit-details-marker]:hidden">{w.shopAll}</summary>
              <div className="absolute inset-x-0 top-full z-40 border-y border-store-line bg-store-paper">
                <ul className="mx-auto grid max-w-6xl grid-cols-4 gap-4 px-6 py-6 lg:grid-cols-6">
                  {panel.map((c) => (
                    <li key={c.handle}><Link href={href(`/collections/${c.handle}`)} className="group/t block space-y-2">
                      <span className="relative block aspect-[4/5] overflow-hidden rounded-[var(--store-radius)] bg-store-chip">{c.image && <Photo p={c.image} alt="" sizes="180px" className="absolute inset-0 h-full w-full object-cover" />}</span>
                      <span className="block text-sm">{c.title}</span>
                    </Link></li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="px-3 py-2.5">{c.title}</Link>)}
        </nav>
      )}
    </>
  )
}

/** Split (2.0): the collections on the left, the logo centred, the bag on the right; a phone gets the menu sheet. */
function SplitHeader(p: HeaderProps) {
  const { shop, href, gated, w, set, own } = p
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:px-6">
      <div className="min-w-0">
        {!gated && <>
          <nav aria-label={w.shopNav} className="hidden gap-1 text-sm sm:flex">
            {own ? <MenuRow items={own.slice(0, 5)} href={href} set={set} className="gap-1" link="px-2 py-2" /> : <>
              <Link href={href('/products')} className="store-nav whitespace-nowrap px-2 py-2">{w.shopAll}</Link>
              {shop.nav.slice(0, 4).map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="store-nav whitespace-nowrap px-2 py-2">{c.title}</Link>)}
            </>}
          </nav>
          <details className="relative sm:hidden">
            <summary aria-label={w.menu} className="grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden"><MenuIcon set={set} /></summary>
            <nav aria-label={w.menu} className="absolute left-0 top-12 z-40 max-h-[70dvh] w-64 space-y-1 overflow-y-auto rounded-[var(--store-radius)] border border-store-line bg-store-paper p-3 text-base shadow-sm">
              {own ? <MenuDrawer items={own} href={href} set={set} w={w} /> : <>
                <Link href={href('/products')} className="block py-2">{w.shopAll}</Link>
                {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="block py-2">{c.title}</Link>)}
              </>}
              <Link href={href('/policies/contact')} className="block py-2 text-store-sub">{w.contact}</Link>
            </nav>
          </details>
        </>}
      </div>
      <Logo shop={shop} href={href} upper className="text-base font-bold tracking-[0.2em] sm:text-lg" />
      <div className="flex justify-end">{!gated && <Bag {...p} />}</div>
    </div>
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

/** The footer on every page (inside the shell, which sets --store-display). */
export function ShopFooter({ f, href, variant = 'three', social = true, w = wordsFor(f.shopLanguage), painted = false, strip = [] }: { f: ShellShop; href: Href; variant?: FooterVariant; social?: boolean; w?: Words
  /** Painted in another scheme (footer colours, 2.0): its own background, edge to edge. */
  painted?: boolean; strip?: StripPiece[] }) {
  if (variant === 'gram') return <StripFooter f={f} href={href} social={social} w={w} painted={painted} strip={strip} />
  if (variant === 'compact') return <CompactFooter f={f} href={href} social={social} w={w} painted={painted} />
  if (variant === 'statement') return <StatementFooter f={f} href={href} social={social} w={w} painted={painted} />
  return (
    <footer className={`mt-16 border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : 'bg-store-chip/50'}`}>
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
          {f.grievanceName && <p>{`${w.grievance}: `}{f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
        </div>
      </div>
    </footer>
  )
}

/** One column on every width. The policies, legal name, address and grievance officer stay: the law, not a setting. */
function CompactFooter({ f, href, social, w, painted }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean }) {
  return (
    <footer className={`mt-16 border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : ''}`}>
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

/** Statement (2.0): the shop's name set large, then every legal fact the other footers carry (none is removed). */
function StatementFooter({ f, href, social, w, painted }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean }) {
  return (
    <footer className={`mt-16 overflow-hidden border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 text-sm sm:px-6 sm:py-14">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            {f.tagline && <p className="max-w-sm text-base text-store-sub">{f.tagline}</p>}
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
            {f.grievanceName && <p>{`${w.grievance}: `}{f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
          </div>
        </div>
        <p aria-hidden="true" className="truncate border-t border-store-line pt-6 text-[clamp(2.5rem,11vw,8rem)] leading-none tracking-tight" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
      </div>
    </footer>
  )
}

/** Instagram strip (2.1): the newest pieces' photos in a row (each opens its page), the shop's Instagram, then the
 *  compact footer's legal lines (none is removed). No Instagram embed: the photos are the shop's own. */
function StripFooter({ f, href, social, w, painted, strip }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean; strip: StripPiece[] }) {
  return (
    <div className="mt-16">
      {strip.length > 0 && (
        <div className="border-t border-store-line">
          <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-6">
            {strip.slice(0, 6).map((p) => (
              <li key={p.handle}><Link href={href(`/products/${p.handle}`)} className="group relative block aspect-square overflow-hidden bg-store-chip">
                <Photo p={p.image} alt={p.title} sizes="(min-width: 640px) 17vw, 33vw" className="absolute inset-0 h-full w-full object-cover" />
              </Link></li>
            ))}
          </ul>
          {social && f.instagram && <p className="py-3 text-center text-sm"><a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">@{f.instagram.replace(/^@/, '')}</a></p>}
        </div>
      )}
      <div className="-mt-16"><CompactFooter f={f} href={href} social={social} w={w} painted={painted} /></div>
    </div>
  )
}
