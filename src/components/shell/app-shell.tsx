import { Suspense, type CSSProperties, type ReactNode } from 'react'
import { signOutAction } from '@/app/(admin)/admin/sign-out/actions'
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
  /** STAFF tag, Admin only. */
  staffTag?: boolean
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

export function AppShell({ ink = false, title, staffTag = false, navLabel, groups, tabs, more, foot, email, tenantId, banner, children }: ShellProps) {
  const surface = ink ? 'ink' : undefined
  return (
    <div data-shell data-tenant={tenantId} style={{ '--shell-top': banner ? '2.75rem' : '0px' } as CSSProperties} className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <a href="#content" className="sr-only text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      {banner}
      <Suspense fallback={null}><NavProgress /></Suspense>
      <div className="md:flex">
        <aside data-surface={surface} className={`sticky top-[var(--shell-top)] hidden h-[calc(100dvh-var(--shell-top))] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r px-2.5 py-3 md:flex print:hidden ${ink ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
          <div className="flex items-center gap-2.5 px-1.5 pb-2">
            <Mark ink={ink} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-tight" title={title}>{title}{staffTag && <span className="ml-1.5 rounded-sm bg-warn px-1.5 align-middle text-xs font-semibold text-warn-text">STAFF</span>}</p>
            </div>
          </div>
          <SidebarNav label={navLabel} groups={groups} ink={ink} />
          <div className={`mt-auto flex flex-col gap-0.5 border-t pt-2 ${ink ? 'border-primary-foreground/15' : 'border-border'}`}>
            {foot.length > 0 && <SidebarNav label={`${navLabel}: more`} groups={[{ label: '', items: foot }]} ink={ink} />}
            <Account email={email} ink={ink} />
          </div>
        </aside>
        <header data-surface={surface} className={`flex h-12 items-center gap-2.5 border-b px-4 md:hidden print:hidden ${ink ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
          <Mark ink={ink} />
          <span className="min-w-0 truncate text-sm font-semibold">{title}</span>
          {staffTag && <span className="rounded-sm bg-warn px-1.5 text-xs font-semibold text-warn-text">STAFF</span>}
        </header>
        <main id="content" tabIndex={-1} className="min-w-0 flex-1 space-y-6 p-4 pb-24 outline-none md:p-6">{children}</main>
      </div>
      <BottomBar label={navLabel} tabs={tabs} more={[...more, ...foot]} ink={ink} moreFoot={<Account email={email} ink={false} />} />
      <div id={ANNOUNCER_ID} aria-live="polite" aria-atomic="true" className="sr-only" />
    </div>
  )
}
