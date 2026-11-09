import 'server-only'
import Link from 'next/link'
import type { MenuItem } from '@/domains/themes/site'
import { ShopIcon, type IconSet } from './icon'
import type { Words } from './words'

// =============================================================================
// FILE: src/components/storefront/nav.tsx — the merchant's menus on the shop (Look v4 § Menus). No script: a
// computer's sub-menus open on hover and focus, a phone's drawer nests with <details>. Every level that has items
// starts with "View all" (its own page), categories first (Baymard 2026). An icon sits beside its words, never
// instead of them.
// =============================================================================

type Href = (path: string) => string
const Label = ({ x, set }: { x: MenuItem; set: IconSet }) => <>{x.icon && <ShopIcon name={x.icon} set={set} className="size-4" />}<span>{x.label}</span></>

/** A computer's row: each top item a link; one with sub-items opens a panel under it (hover or keyboard focus). */
export function MenuRow({ items, href, set, className = '', link = 'px-3 py-2.5' }: { items: MenuItem[]; href: Href; set: IconSet; className?: string; link?: string }) {
  return (
    <ul className={`flex ${className}`}>
      {items.map((x) => (
        <li key={x.id} className="group/m relative">
          <Link href={href(x.link)} className={`store-nav inline-flex items-center gap-1.5 whitespace-nowrap ${link}`} aria-haspopup={x.children.length ? 'true' : undefined}><Label x={x} set={set} /></Link>
          {x.children.length > 0 && (
            <div className="invisible absolute left-0 top-full z-40 min-w-56 rounded-[var(--store-radius)] border border-store-line bg-store-paper p-3 text-left opacity-0 shadow-sm transition-opacity duration-150 group-focus-within/m:visible group-focus-within/m:opacity-100 group-hover/m:visible group-hover/m:opacity-100">
              <ul className={x.children.some((c) => c.children.length) ? 'grid grid-flow-col gap-6' : 'space-y-1'}>
                {x.children.map((c) => (
                  <li key={c.id}>
                    <Link href={href(c.link)} className={`flex items-center gap-1.5 py-1.5 ${c.children.length ? 'font-medium' : ''}`}><Label x={c} set={set} /></Link>
                    {c.children.length > 0 && <ul className="space-y-0.5">{c.children.map((g) => <li key={g.id}><Link href={href(g.link)} className="flex items-center gap-1.5 py-1 text-store-sub hover:text-store-ink"><Label x={g} set={set} /></Link></li>)}</ul>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A phone's drawer (and the menu sheet): categories first; an item with sub-items opens in place, "View all" first. */
export function MenuDrawer({ items, href, set, w }: { items: MenuItem[]; href: Href; set: IconSet; w: Words }) {
  const level = (xs: MenuItem[], depth: number): React.ReactNode => (
    <ul className={depth ? 'border-l border-store-line pl-3' : ''}>
      {xs.map((x) => (
        <li key={x.id}>
          {x.children.length ? (
            <details className="group/d">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2 [&::-webkit-details-marker]:hidden">
                <Label x={x} set={set} /><ShopIcon name="chevron" set={set} className="ml-auto size-4 transition-transform group-open/d:rotate-90" />
              </summary>
              <div className="pb-1">
                <Link href={href(x.link)} className="block py-2 pl-3 text-store-sub">{w.viewAll}</Link>
                {level(x.children, depth + 1)}
              </div>
            </details>
          ) : <Link href={href(x.link)} className="flex items-center gap-1.5 py-2"><Label x={x} set={set} /></Link>}
        </li>
      ))}
    </ul>
  )
  return level(items, 0)
}

/** The footer menu: one level, a row of links above the footer. */
export function FooterMenu({ items, href, set, w }: { items: MenuItem[]; href: Href; set: IconSet; w: Words }) {
  return (
    <nav aria-label={w.footerNav} className="border-t border-store-line">
      <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-5 gap-y-1 px-4 py-4 text-sm sm:px-6">
        {items.map((x) => <li key={x.id}><Link href={href(x.link)} className="inline-flex items-center gap-1.5 py-1 hover:underline"><Label x={x} set={set} /></Link></li>)}
      </ul>
    </nav>
  )
}
