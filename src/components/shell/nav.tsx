'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '@/components/icons/icon'

// =============================================================================
// FILE: src/components/shell/nav.tsx — the shell's two navs (client islands).
//
// The only client parts of AppShell: they need the path to mark where you are
// (frata-design-language § UX foundation rules 9–10). Items come from the
// server as plain data; icons are named, not passed (functions do not cross
// the server/client line). The count pill is a server-rendered slot.
// =============================================================================

/** `children`: entries shown under this one (Apps lists the shop's active apps), folded and unfolded by its chevron. */
export type NavItem = { href: string; label: string; icon: IconName; badge?: ReactNode; exact?: boolean; children?: NavItem[] }
export type NavGroup = { label: string; items: NavItem[] }

/** Every item, its children after it (for finding the current one). */
const flat = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...(i.children ?? [])])

/** The item a path belongs to: exact for home-like items, else the longest matching prefix. */
function currentHref(path: string, items: NavItem[]): string | null {
  let best: NavItem | null = null
  for (const i of items) {
    const hit = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`)
    if (hit && (!best || i.href.length > best.href.length)) best = i
  }
  return best?.href ?? null
}


/** ≥ 768 px: the sidebar's groups. The current item: a 3 px bar, semibold, aria-current (never colour alone). */
export function SidebarNav({ label, groups, ink = false }: { label: string; groups: NavGroup[]; ink?: boolean }) {
  const path = usePathname()
  const on = currentHref(path, flat(groups.flatMap((g) => g.items)))
  const link = (i: NavItem, sub = false) => {
    const cur = i.href === on
    return (
      <Link key={i.href} href={i.href} aria-current={cur ? 'page' : undefined}
        className={`relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-fast ease-standard ${sub ? 'h-8 pl-8' : 'h-9'} ${cur ? 'font-semibold' : ''} ${ink
          ? (cur ? 'bg-primary-foreground/15' : 'hover:bg-primary-foreground/10')
          : (cur ? 'bg-accent' : 'hover:bg-accent')}`}>
        {cur && <span aria-hidden="true" className={`absolute -left-2.5 top-2 bottom-2 w-[3px] rounded-r ${ink ? 'bg-warn' : 'bg-thread'}`} />}
        <Icon name={i.icon} current={cur} className={`size-4 shrink-0 ${cur ? '' : ink ? 'opacity-70' : 'text-muted-foreground'}`} />
        <span className="truncate">{i.label}</span>
        {i.badge}
      </Link>
    )
  }
  return (
    <nav aria-label={label} data-tinge className="flex flex-col gap-0.5">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          {g.label && <p className={`px-2 pb-1 pt-3 text-xs font-medium ${ink ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{g.label}</p>}
          {g.items.map((i) => i.children?.length
            ? <Folder key={i.href} item={i} on={on} ink={ink} link={link} />
            : link(i))}
        </div>
      ))}
    </nav>
  )
}

/** An item with children: its link, a chevron that folds them, and the children. Open by default; the choice is kept. */
function Folder({ item, on, ink, link }: { item: NavItem; on: string | null; ink: boolean; link: (i: NavItem, sub?: boolean) => ReactNode }) {
  const key = `nav:folded:${item.href}`
  const [folded, setFolded] = useState(false)
  useEffect(() => { try { setFolded(localStorage.getItem(key) === '1') } catch { /* page only */ } }, [key])
  const toggle = () => setFolded((f) => { try { localStorage.setItem(key, f ? '0' : '1') } catch { /* page only */ } return !f })
  // A child page is never hidden: folded or not, the current one stays in view.
  const kids = item.children ?? []
  const shown = folded ? kids.filter((c) => c.href === on) : kids
  const list = `nav-kids-${item.href.replace(/\W+/g, '-')}`
  return (
    <>
      <div className="flex items-center">
        {link(item)}
        <button type="button" onClick={toggle} aria-expanded={!folded} aria-controls={list} aria-label={`${folded ? 'Show' : 'Hide'} ${item.label.toLowerCase()} in use`}
          className={`ml-0.5 inline-grid size-8 shrink-0 place-items-center rounded-md ${ink ? 'hover:bg-primary-foreground/10' : 'hover:bg-accent'}`}>
          <Icon name="chevron" className={`size-3.5 transition-transform duration-fast ease-standard ${folded ? '' : 'rotate-90'} ${ink ? 'opacity-70' : 'text-muted-foreground'}`} />
        </button>
      </div>
      <div id={list} className="flex flex-col gap-0.5">{shown.map((c) => link(c, true))}</div>
    </>
  )
}

/**
 * < 768 px: four tabs at the bottom, labels always shown, 56 px tall; the fourth opens More, a sheet with the
 * rest. A page that lives in More marks More as current. The sheet closes on a link tap, Esc or the scrim.
 */
export function BottomBar({ label, tabs, more, moreFoot, ink = false }: { label: string; tabs: NavItem[]; more: NavItem[]; moreFoot?: ReactNode; ink?: boolean }) {
  const path = usePathname()
  const on = currentHref(path, flat([...tabs, ...more]))
  const inMore = flat(more).some((i) => i.href === on)
  const [open, setOpen] = useState(false)
  const sheet = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => { setOpen(false) }, [path])
  // The dialog primitive's sheet motion (data-dialog, globals.css): in on the spring, out in 200 ms, the standard
  // scrim — it used to vanish on close (motion system 2026-11-08).
  // A native modal <dialog>: focus stays inside, the page behind is inert, Esc closes; focus returns to More. The
  // page behind does not scroll while it is open: a CSS rule on dialog[data-more][open] (globals.css), so no path
  // (a sign-out, a refresh to a refusal) can leave <html> locked. Turning the phone past 768 px closes it, since
  // the sheet is phone-only (impact review U·2a).
  useEffect(() => {
    const d = sheet.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)')
    const close = () => { if (wide.matches) setOpen(false) }
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])
  const tab = (cur: boolean) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${cur ? 'font-semibold' : ''} ${ink
    ? (cur ? 'text-primary-foreground' : 'text-primary-foreground/70') : (cur ? 'text-foreground' : 'text-muted-foreground')}`
  const bar = (cur: boolean) => cur && <span aria-hidden="true" className={`absolute inset-x-[30%] top-0 h-0.5 rounded-b ${ink ? 'bg-warn' : 'bg-thread'}`} />
  return (
    <>
      <nav aria-label={label} data-tinge data-surface={ink ? 'ink' : undefined} className={`fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom,0px)] md:hidden print:hidden ${ink ? 'border-primary bg-primary' : 'border-border bg-card'}`}>
        {tabs.map((i) => {
          const cur = i.href === on
          return (
            <Link key={i.href} href={i.href} aria-current={cur ? 'page' : undefined} className={tab(cur)}>
              {bar(cur)}<span className="relative"><Icon name={i.icon} current={cur} className="size-[22px]" />{i.badge && <span className="absolute -right-3.5 -top-1.5">{i.badge}</span>}</span>{i.label}
            </Link>
          )
        })}
        <button ref={opener} type="button" aria-haspopup="dialog" aria-expanded={open} aria-current={inMore ? 'page' : undefined} onClick={() => setOpen(true)} className={tab(inMore)}>
          {bar(inMore)}<Icon name="menu" current={inMore} className="size-[22px]" />More
        </button>
      </nav>
      <dialog ref={sheet} data-more data-dialog data-tinge aria-label="More" onClose={() => { setOpen(false); opener.current?.focus() }}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        className="m-0 mt-auto w-full max-w-none rounded-t-xl border-t border-border bg-card p-0 text-foreground">
        <div className="p-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
        <div className="flex items-center justify-between px-3 py-1">
          <span aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-border" />
          <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Close" className="inline-grid size-10 place-items-center rounded-md hover:bg-accent"><Icon name="close" className="size-5" /></button>
        </div>
        {more.flatMap((i) => [{ i, sub: false }, ...(i.children ?? []).map((c) => ({ i: c, sub: true }))]).map(({ i, sub }) => (
          <Link key={i.href} href={i.href} aria-current={i.href === on ? 'page' : undefined} onClick={() => setOpen(false)}
            className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent ${sub ? 'pl-11' : ''} ${i.href === on ? 'bg-accent font-semibold' : ''}`}>
            <Icon name={i.icon} className="size-5 text-muted-foreground" />{i.label}
          </Link>
        ))}
        {moreFoot && <div className="mt-1 border-t border-border pt-1">{moreFoot}</div>}
        </div>
      </dialog>
    </>
  )
}

/**
 * A count in the nav: a warn pill with the number in mono (rule 9). Renders nothing at 0. A screen reader hears
 * the link as "Orders, 6 to confirm" (`label` is what the number counts, lower case).
 */
export function NavPill({ n, label }: { n: number; label: string }) {
  if (!n) return null
  return <span className="ml-auto rounded-full bg-warn px-1.5 font-mono text-xs font-semibold leading-[18px] text-warn-text tabular-nums"><span className="sr-only">, </span>{n > 999 ? '999+' : n}<span className="sr-only"> {label}</span></span>
}
