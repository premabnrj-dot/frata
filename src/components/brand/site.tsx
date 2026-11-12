import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { button } from '@/components/ui/button'
import { FRATA_WHATSAPP_DISPLAY, frataWhatsappLink } from '@/lib/site'
import { cn } from '@/lib/utils'
import { Wordmark } from './wordmark'

// =============================================================================
// FILE: src/components/brand/site.tsx — the public pages' frame (website spec W·1): one stage, header, selvedge
// and footer for /, /partners, /login and /start. The stage is ink (data-surface="ink": paper focus rings); the
// block print lives only in the selvedge strip at its edge, never behind numbers, controls or forms (brand rule 39).
// =============================================================================

/** The ink stage a public page opens on. */
export function SiteStage({ children, className }: { children: ReactNode; className?: string }) {
  return <div data-surface="ink" className={cn('bg-ink text-ink-foreground', className)}>{children}</div>
}

/** The block print as a woven edge: a strip under the stage, the only place the pattern appears on a public page. */
export function Selvedge() {
  return <div aria-hidden="true" className="block-print h-9 bg-ink" style={{ '--block-print-ink': 'var(--ink-foreground)' } as CSSProperties} />
}

export type SiteLink = { href: string; label: string }

/** The header on the stage: skip link, the mark (with its thread), a few links (hidden on a phone), one action. */
export function SiteHeader({ section, links, action }: { section?: string; links: SiteLink[]; action?: SiteLink }) {
  return (
    <header className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-4 sm:px-8">
      <a href="#content" className="sr-only text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-ink-foreground focus:px-3 focus:py-2">Skip to content</a>
      <Link href={section ? '/partners' : '/'} aria-label={section ? `Frrata ${section}` : 'Frrata home'} className="inline-flex min-h-6 items-center gap-2">
        <Wordmark thread onInk label={null} className="h-6" />{section && <span className="text-sm text-ink-foreground/70">{section}</span>}
      </Link>
      <span className="flex-1" />
      {links.map((l, i) => <Link key={l.href} href={l.href} className={cn('inline-flex min-h-6 items-center text-sm text-ink-foreground/70 hover:text-ink-foreground', i < links.length - 1 && 'hidden sm:inline-flex')}>{l.label}</Link>)}
      {action && <Link href={action.href} className={button({ variant: 'inverse' })}>{action.label}</Link>}
    </header>
  )
}

/** WhatsApp, written out: the number is the point (no Indian competitor puts one beside the call to action). */
export function WhatsAppLine({ text }: { text?: string }) {
  return <a href={frataWhatsappLink(text)} target="_blank" rel="noopener" className="inline-flex min-h-6 items-center gap-1.5 text-sm text-ink-foreground/70 hover:text-ink-foreground">or WhatsApp <span className="font-mono font-semibold text-ink-foreground">{FRATA_WHATSAPP_DISPLAY}</span></a>
}

export function SiteFooter({ links }: { links: SiteLink[] }) {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-8">
      <Wordmark className="h-4" />
      {links.map((l) => <Link key={l.href} href={l.href} className="inline-flex min-h-6 items-center hover:text-foreground">{l.label}</Link>)}
      <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="inline-flex min-h-6 items-center gap-1 hover:text-foreground">WhatsApp · <span className="font-mono">{FRATA_WHATSAPP_DISPLAY}</span></a>
      <span>Made in India</span>
    </footer>
  )
}

/** The Neel band: four numbers, each with a few words. */
export function NumberBand({ items, label }: { items: [string, string][]; label: string }) {
  return (
    <section aria-label={label} className="bg-neel text-ink-foreground">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-8 md:grid-cols-4">
        {items.map(([n, l]) => <div key={l} className="flex flex-col-reverse gap-1"><dt className="text-sm text-ink-foreground/80">{l}</dt><dd className="font-mono text-4xl font-semibold tracking-tight">{n}</dd></div>)}
      </dl>
    </section>
  )
}
