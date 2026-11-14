import { Suspense, type CSSProperties, type ReactNode } from 'react'
import { signOutAction } from '@/app/(admin)/admin/sign-out/actions'
import { switchStoreAction } from '@/app/choose/actions'
import { ANNOUNCER_ID } from './announce'
import { SHELL_FONT_VARS } from './fonts'
import { BottomBar, SidebarNav, type NavGroup, type NavItem } from './nav'
import { NavProgress } from './nav-progress'
import { Monogram } from '@/components/brand/monogram'
import { Toaster } from '@/components/ui/toast'
import { RailToggle } from './rail-toggle'
import { railAttr, type RailChoice } from './rail'
import { Icon } from '@/components/icons/icon'

// =============================================================================
// FILE: src/components/shell/app-shell.tsx — ONE shell for Console and Admin.
//
// frata-design-language § UX foundation rules 8–12. The same skeleton in both
// surfaces: skip link first, then the support banner, a 232 px sidebar (a 64 px
// rail from 768 to 1279 px and by choice: Neel N1), a bottom bar with More below it, an account block at every width,
// the progress bar, one polite live region. Admin differs only in chrome
// (`ink`: the ink frame, the reversed mark, STAFF). --shell-top is the height
// of what is stuck above the page (the banner): the sidebar and the SaveBar
// sit under it. The shell imports no data
// module (gate in check:tenant): its layout reads, and hands it plain values
// and the count pill as a slot (plan U · T1, T2). Every page still checks
// access itself; a layout refusal renders a Panel, never a redirect.
// =============================================================================

export type ShellProps = {
  ink?: boolean
  /** Name in the sidebar and phone top bar (the shop, or "Frrata Admin"). */
  title: string
  /** STAFF on Admin, PARTNER on the partner workspace (frata-design-language § Partner workspace). */
  tag?: 'STAFF' | 'PARTNER'
  /** Every place this person can be (F3 store switcher): shown only when there are two or more. */
  places?: Place[]
  navLabel: string
  groups: NavGroup[]
  tabs: NavItem[]
  more: NavItem[]
  /** Links under the nav: Preview shop, Frrata Admin, the staffer's own store. */
  foot: NavItem[]
  email: string | null
  /** The shop the shell was drawn for (Console): TenantCheck compares each page's against it. */
  tenantId?: string
  banner?: ReactNode
  /** Under the name in the sidebar: the store's address (Console), a streamed slot. */
  subtitle?: ReactNode
  /** The person's choice of width (the `rail` cookie through railFrom): the rail, the full sidebar, or by width. */
  rail?: RailChoice
  children: ReactNode
}

export type Place = { href: string; name: string; role: string; current: boolean; tenantId?: string }

function Tag({ tag }: { tag?: 'STAFF' | 'PARTNER' }) {
  if (!tag) return null
  return <span className={`ml-1.5 rounded-sm px-1.5 align-middle text-xs font-semibold ${tag === 'STAFF' ? 'bg-warn text-warn-text' : 'bg-info text-info-text'}`}>{tag}</span>
}

/**
 * F3 · one switcher for everyone with two or more places (a partner, an owner with two brands). It lists only what
 * app_access_for returned; choosing a store posts its id to switchStoreAction, which sets frata_tenant only to one
 * of those. A <details>, so it works before any script loads.
 */
function Switcher({ places, ink }: { places: Place[]; ink: boolean }) {
  if (places.length < 2) return null
  const here = places.find((p) => p.current)
  return (
    <details className="group relative px-2 py-1">
      <summary className={`flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-2 text-sm font-medium ${ink ? 'border-ink-foreground/30' : 'border-input'}`}>
        <span className="truncate">{here ? here.name : 'Switch'}</span><span aria-hidden="true" className="text-xs">▾</span>
        <span className="sr-only">: switch store</span>
      </summary>
      <ul className="absolute bottom-full left-2 right-2 z-40 mb-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground">
        {places.map((p) => (
          <li key={p.href + (p.tenantId ?? '')}>
            {p.tenantId ? (
              <form action={switchStoreAction}>
                <input type="hidden" name="tenantId" value={p.tenantId} />
                <button type="submit" aria-current={p.current || undefined} className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-accent ${p.current ? 'bg-accent font-semibold' : ''}`}>
                  <span className="truncate">{p.name}</span><span className="shrink-0 text-xs text-muted-foreground">{p.role}</span>
                </button>
              </form>
            ) : (
              <a href={p.href} aria-current={p.current || undefined} className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-accent ${p.current ? 'bg-accent font-semibold' : ''}`}>
                <span className="truncate">{p.name}</span><span className="shrink-0 text-xs text-muted-foreground">{p.role}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Mark({ ink }: { ink: boolean }) {
  return (
    <Monogram size={28} tone={ink ? 'brand' : 'ink'} />
  )
}

function Account({ email, ink }: { email: string | null; ink: boolean }) {
  if (!email) return null
  return (
    <form action={signOutAction} className="flex items-center gap-2 px-2 py-1.5">
      <span className={`min-w-0 flex-1 truncate font-num text-xs ${ink ? 'text-ink-foreground/70' : 'text-muted-foreground'}`} title={email}>{email}</span>
      <button type="submit" className={`inline-flex min-h-6 shrink-0 items-center rounded-md px-1.5 text-xs font-medium underline-offset-2 hover:underline ${ink ? '' : 'text-foreground'}`}>Sign out</button>
    </form>
  )
}

export function AppShell({ ink = false, title, tag, places = [], navLabel, groups, tabs, more, foot, email, tenantId, banner, subtitle, rail = null, children }: ShellProps) {
  const surface = ink ? 'ink' : undefined
  return (
    <div data-shell data-neel="" data-tenant={tenantId} style={{ '--shell-top': banner ? '2.75rem' : '0px' } as CSSProperties /* the banner's own height reads this too */} className={`min-h-dvh bg-background [--toast-lift:3.5rem] md:[--toast-lift:0px] ${SHELL_FONT_VARS}`}>
      {/* The surface's ONE Toaster (§ Feedback): inside [data-shell] (its font and focus ring), outside main (never under
          its aria-busy); Admin's is calm (no snap). The shell's own polite region below serves its announce(). */}
      <Toaster region={false} calm={ink}>
      <a href="#content" className="sr-only text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {banner}
      <Suspense fallback={null}><NavProgress /></Suspense>
      <div className="md:flex">
        {/* Neel § Layout · Sidebar: 232 px from 1280; a 64 px rail from 768 to 1279 (CSS) and by choice ([data-rail], the
            `rail` cookie); the rail's rules are in src/app/neel.css. */}
        <aside data-surface={surface} data-shell-aside="" data-rail={railAttr(rail)}
          className={`sticky top-[var(--shell-top)] hidden h-[calc(100dvh-var(--shell-top))] w-58 shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-2.5 py-3.5 md:flex print:hidden ${ink ? 'border-ink bg-ink text-ink-foreground' : 'border-border bg-side'}`}>
          <div data-nav-shop="" className="flex items-center gap-2.5 px-2 pt-1.5 pb-3.5">
            <Mark ink={ink} />
            <div data-nav-label="" className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-tight" title={title}>{title}<Tag tag={tag} /></p>
              {subtitle ? <p className={`truncate text-small ${ink ? 'text-ink-foreground/70' : 'text-muted-foreground'}`}>{subtitle}</p> : null}
            </div>
          </div>
          <SidebarNav label={navLabel} groups={groups} ink={ink} />
          <div className={`mt-auto flex flex-col gap-0.5 border-t pt-2 ${ink ? 'border-ink-foreground/15' : 'border-border'}`}>
            {foot.length > 0 && <SidebarNav label={`${navLabel}: more`} groups={[{ label: '', items: foot }]} ink={ink} />}
            <div data-nav-label=""><Switcher places={places} ink={ink} /><Account email={email} ink={ink} /></div>
            {/* On the rail the account keeps its two ways out, as icons with their names (design-system review N1). */}
            {places.length > 1 && <a href="/choose" data-nav="" data-rail-only="" className={`relative flex h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium ${ink ? 'hover:bg-ink-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
              <Icon name="merchants" className="size-4.5 shrink-0" /><span data-nav-label="">Switch store</span></a>}
            {email && <form action={signOutAction} data-rail-only="" className="contents">
              <button type="submit" data-nav="" className={`relative flex h-8.5 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium ${ink ? 'hover:bg-ink-foreground/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                <Icon name="signout" className="size-4.5 shrink-0" /><span data-nav-label="">Sign out</span></button></form>}
            <RailToggle choice={rail} ink={ink} />
          </div>
        </aside>
        <header data-surface={surface} className={`flex h-12 items-center gap-2.5 border-b px-4 md:hidden print:hidden ${ink ? 'border-ink bg-ink text-ink-foreground' : 'border-border bg-card'}`}>
          <Mark ink={ink} />
          <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
          <Tag tag={tag} />
        </header>
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 space-y-6 p-4 pb-24 outline-none md:p-6 xl:px-8 xl:pt-7">{children}</main>
      </div>
      <BottomBar label={navLabel} tabs={tabs} more={[...more, ...foot]} ink={ink} moreFoot={<><Switcher places={places} ink={false} /><Account email={email} ink={false} /></>} />
      <div id={ANNOUNCER_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
      </Toaster>
    </div>
  )
}
