import { Suspense, type CSSProperties, type ReactNode } from 'react'
import { signOutAction } from '@/app/(admin)/admin/sign-out/actions'
import { switchStoreAction } from '@/app/choose/actions'
import { ANNOUNCER_ID } from './announce'
import { SHELL_FONT_VARS } from './fonts'
import { BottomBar, SidebarNav, type NavGroup, type NavItem } from './nav'
import { NavProgress } from './nav-progress'

// =============================================================================
// FILE: src/components/shell/app-shell.tsx — ONE shell for Console and Admin.
//
// frata-design-language § UX foundation rules 8–12. The same skeleton in both
// surfaces: skip link first, then the support banner, a 224 px sidebar from
// 768 px, a bottom bar with More below it, an account block at every width,
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
  /** Name in the sidebar and phone top bar (the shop, or "Frata Admin"). */
  title: string
  /** STAFF on Admin, PARTNER on the partner workspace (frata-design-language § Partner workspace). */
  tag?: 'STAFF' | 'PARTNER'
  /** Every place this person can be (F3 store switcher): shown only when there are two or more. */
  places?: Place[]
  navLabel: string
  groups: NavGroup[]
  tabs: NavItem[]
  more: NavItem[]
  /** Links under the nav: Preview shop, Frata Admin, the staffer's own store. */
  foot: NavItem[]
  email: string | null
  /** The shop the shell was drawn for (Console): TenantCheck compares each page's against it. */
  tenantId?: string
  banner?: ReactNode
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
      <summary className={`flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-2 text-sm font-medium ${ink ? 'border-primary-foreground/30' : 'border-input'}`}>
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
    <span aria-hidden="true" className={`inline-grid size-7 shrink-0 place-items-center rounded-[7px] text-base font-bold tracking-tighter ${ink ? 'bg-card text-brand' : 'bg-brand text-brand-foreground'}`}>F</span>
  )
}

function Account({ email, ink }: { email: string | null; ink: boolean }) {
  if (!email) return null
  return (
    <form action={signOutAction} className="flex items-center gap-2 px-2 py-1.5">
      <span className={`min-w-0 flex-1 truncate font-mono text-xs ${ink ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} title={email}>{email}</span>
      <button type="submit" className={`inline-flex min-h-6 shrink-0 items-center rounded-md px-1.5 text-xs font-medium underline-offset-2 hover:underline ${ink ? '' : 'text-foreground'}`}>Sign out</button>
    </form>
  )
}

export function AppShell({ ink = false, title, tag, places = [], navLabel, groups, tabs, more, foot, email, tenantId, banner, children }: ShellProps) {
  const surface = ink ? 'ink' : undefined
  return (
    <div data-shell data-tenant={tenantId} style={{ '--shell-top': banner ? '2.75rem' : '0px' } as CSSProperties /* the banner's own height reads this too */} className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <a href="#content" className="sr-only text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {banner}
      <Suspense fallback={null}><NavProgress /></Suspense>
      <div className="md:flex">
        <aside data-surface={surface} className={`sticky top-[var(--shell-top)] hidden h-[calc(100dvh-var(--shell-top))] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r px-2.5 py-3 md:flex print:hidden ${ink ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
          <div className="flex items-center gap-2.5 px-1.5 pb-2">
            <Mark ink={ink} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-tight" title={title}>{title}<Tag tag={tag} /></p>
            </div>
          </div>
          <SidebarNav label={navLabel} groups={groups} ink={ink} />
          <div className={`mt-auto flex flex-col gap-0.5 border-t pt-2 ${ink ? 'border-primary-foreground/15' : 'border-border'}`}>
            {foot.length > 0 && <SidebarNav label={`${navLabel}: more`} groups={[{ label: '', items: foot }]} ink={ink} />}
            <Switcher places={places} ink={ink} />
            <Account email={email} ink={ink} />
          </div>
        </aside>
        <header data-surface={surface} className={`flex h-12 items-center gap-2.5 border-b px-4 md:hidden print:hidden ${ink ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
          <Mark ink={ink} />
          <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
          <Tag tag={tag} />
        </header>
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 space-y-6 p-4 pb-24 outline-none md:p-6">{children}</main>
      </div>
      <BottomBar label={navLabel} tabs={tabs} more={[...more, ...foot]} ink={ink} moreFoot={<><Switcher places={places} ink={false} /><Account email={email} ink={false} /></>} />
      <div id={ANNOUNCER_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
    </div>
  )
}
