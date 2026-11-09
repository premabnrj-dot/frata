import Link from 'next/link'
import type { MenuItem } from '@/domains/themes/site'
import { BagButton } from './bag'
import { ShopIcon, type IconSet } from './icon'
import { MenuDrawer, MenuRow } from './nav'
import type { Words } from './words'
import { Photo } from './photo'

import type { Circle, Href, ShellShop } from './shell'

// The shop's headers (split from shell.tsx for theme Signal, plan S1-2; no visible change).

export const Logo = ({ shop, href, className, upper = true }: { shop: ShellShop; href: Href; className: string; upper?: boolean }) => (
  <Link href={href('/')} className={className} style={{ fontFamily: 'var(--store-display)' }}>
    {shop.logoUrl ? <img src={shop.logoUrl} alt={shop.shopName} height={32} width={128} className="h-8 w-auto max-w-32 object-contain object-left" /> : upper ? shop.shopName.toUpperCase() : shop.shopName}
  </Link>
)

/** Today's header, exactly. */
export type HeaderProps = { shop: ShellShop; href: Href; gated: boolean; live: boolean; w: Words; set: IconSet; own: MenuItem[] | null }
export const Bag = ({ href, live, w, set }: HeaderProps) => live ? <BagButton checkoutHref={href('/checkout')} shopHref={href('/products')} label={w.bag} count={[w.bagOne, w.bagMany]} icon={<ShopIcon name="bag" set={set} />} /> : null
export const MenuIcon = ({ set }: { set: IconSet }) => <ShopIcon name="menu" set={set} className="size-6" />

export function ClassicHeader(p: HeaderProps) {
  const { shop, href, gated, live, w, set, own } = p
  return (
    <>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Logo shop={shop} href={href} className="mr-auto text-lg font-semibold tracking-[0.12em] sm:text-xl" />
        {/* The collections row scrolls as before; a merchant's menu doesn't (its sub-menus open below it). */}
        {!gated && <nav aria-label={w.shopNav} className={`-mr-2 flex items-center gap-1 text-sm ${own ? '' : 'overflow-x-auto'}`}>
          {own ? <MenuRow items={own} href={href} set={set} className="hidden gap-1 sm:flex" link="px-2 py-2" /> : <>
            <Link href={href('/products')} className="whitespace-nowrap px-2 py-2">{w.shopAll}</Link>
            {shop.nav.map((c) => <Link key={c.handle} href={href(`/collections/${c.handle}`)} className="hidden whitespace-nowrap px-2 py-2 sm:inline">{c.title}</Link>)}
          </>}
          {live && <Bag {...p} />}
        </nav>}
      </div>
      {/* A phone: the top links in a row; with sub-links, the menu sheet instead (they'd be out of reach in a row). */}
      {!gated && own && own.some((x) => x.children.length) && (
        <details className="relative border-t border-store-line sm:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm [&::-webkit-details-marker]:hidden"><MenuIcon set={set} />{w.menu}</summary>
          <nav aria-label={w.menu} className="max-h-[70dvh] overflow-y-auto border-t border-store-line px-4 pb-3 text-base"><MenuDrawer items={own} href={href} set={set} w={w} /></nav>
        </details>
      )}
      {!gated && own && own.length > 0 && !own.some((x) => x.children.length) && (
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
export function MenuHeader(p: HeaderProps & { minimal: boolean; panel?: Circle[] }) {
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
export function SplitHeader(p: HeaderProps) {
  const { shop, href, gated, w, set, own } = p
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 sm:px-6">
      <div className="min-w-0">
        {!gated && <>
          <nav aria-label={w.shopNav} className={`hidden gap-1 text-sm sm:flex ${own ? '' : 'overflow-x-auto'}`}>
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
export function CircleRow({ circles, href, w }: { circles: Circle[]; href: Href; w: Words }) {
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

