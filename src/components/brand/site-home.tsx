import Link from 'next/link'
import type { ReactNode } from 'react'
import { type ExampleOrder, exampleOrderLines } from '@/domains/orders/example'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { FRATA_WHATSAPP_DISPLAY, frataWhatsappLink } from '@/lib/site'
import { Wordmark } from './wordmark'

// =============================================================================
// FILE: src/components/brand/site-home.tsx — the website's parts in Rani Mela (owner-approved 2026-11-22; mockup
// docs/mockups/2026-11-17-homepage-rani-mela.html). Styled by src/app/site.css under [data-site]. No client script.
// =============================================================================

/** The website's icons: a 32 grid, a 2 px round line, one tinted fill. Rendered once per page, used by <SiteIcon>. */
export function SiteIconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <symbol id="si-cod" viewBox="0 0 32 32"><rect className="f" x="4" y="9" width="24" height="14" rx="3" /><rect className="s" x="4" y="9" width="24" height="14" rx="3" /><circle className="s" cx="16" cy="16" r="3.5" /></symbol>
      <symbol id="si-profit" viewBox="0 0 32 32"><path className="f" d="M5 25l7-7 5 4 9-10v13z" /><path className="s" d="M5 24l7-7 5 4 9-10" /><path className="s" d="M21 11h5v5" /></symbol>
      <symbol id="si-ship" viewBox="0 0 32 32"><rect className="f" x="4" y="10" width="14" height="11" rx="1.5" /><path className="s" d="M4 10h14v11H4zM18 14h5l4 4v3h-9z" /><circle className="s" cx="9" cy="23.5" r="2" /><circle className="s" cx="23" cy="23.5" r="2" /></symbol>
      <symbol id="si-chat" viewBox="0 0 32 32"><path className="f" d="M6 7h20v13H13l-6 5v-5H6z" /><path className="s" d="M6 7h20v13H13l-6 5v-5H6z" /><path className="s" d="M11 13.5l3 3 6-6" /></symbol>
      <symbol id="si-return" viewBox="0 0 32 32"><path className="f" d="M9 13h12v12H9z" /><path className="s" d="M9 13h12v12H9z" /><path className="s" d="M13 8h7a6 6 0 0 1 0 12M15 5l-3 3 3 3" /></symbol>
      <symbol id="si-apps" viewBox="0 0 32 32"><rect className="f" x="5" y="5" width="9" height="9" rx="2" /><rect className="s" x="5" y="5" width="9" height="9" rx="2" /><rect className="s" x="18" y="5" width="9" height="9" rx="2" /><rect className="s" x="5" y="18" width="9" height="9" rx="2" /><rect className="s" x="18" y="18" width="9" height="9" rx="2" /></symbol>
      <symbol id="si-guess" viewBox="0 0 32 32"><circle className="f" cx="16" cy="16" r="11" /><circle className="s" cx="16" cy="16" r="11" /><path className="s" d="M12.5 13a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3M16 22.5v.1" /></symbol>
      <symbol id="si-tick" viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="si-plus" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></symbol>
    </svg>
  )
}

export type SiteIconName = 'cod' | 'profit' | 'ship' | 'chat' | 'return' | 'apps' | 'guess'
export function SiteIcon({ name, className = 's-ic' }: { name: SiteIconName | 'tick' | 'plus'; className?: string }) {
  return <svg className={className} aria-hidden="true" focusable="false"><use href={`#si-${name}`} /></svg>
}

/** "Next": a feature not built yet, said wherever it is drawn (website rule 41). */
export function NextTag() {
  return <span className="s-chip s-chip-neel">Next</span>
}

export function HomeHeader({ links, action }: { links: { href: string; label: string }[]; action: { href: string; label: string } }) {
  return (
    <header className="s-head"><div className="s-w">
      <a href="#content" className="s-skip">Skip to content</a>
      <Link href="/" aria-label="Frrata home" className="s-logo"><Wordmark thread label={null} className="h-6" /></Link>
      <nav className="s-nav" aria-label="Main">{links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</nav>
      <Link href={action.href} className="s-btn s-btn-rani s-btn-sm">{action.label}</Link>
    </div></header>
  )
}

export function WhatsAppNote({ text }: { text?: string }) {
  return <a href={frataWhatsappLink(text)} target="_blank" rel="noopener" className="s-wa">or WhatsApp <b>{FRATA_WHATSAPP_DISPLAY}</b></a>
}

export function WhatsAppButton() {
  return <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="s-btn s-btn-neel s-btn-sm">WhatsApp us</a>
}

/** The example order, every line from exampleOrder() and its named costs (website rule 43): never typed. */
export function ExampleOrderCard({ order }: { order: ExampleOrder }) {
  return (
    <figure className="s-order">
      <span className="s-sticker" aria-hidden="true">{formatInr(order.ifDelivered)} kept</span>
      <div className="s-order-top"><span className="s-num">KS-5012 · Example</span><span className="s-chip s-chip-peacock"><i />Delivered</span></div>
      <dl>
        <div className="s-ol"><dt>Order value</dt><dd className="s-num">{formatInr(order.collect)}</dd></div>
        {exampleOrderLines(order).map((l) => <div key={l.label} className="s-ol"><dt>{l.label}</dt><dd className="s-num">{formatInr(paise(-l.amount))}</dd></div>)}
        <div className="s-ol s-total"><dt>You keep</dt><dd className="s-num">{formatInr(order.ifDelivered)}</dd></div>
      </dl>
      <figcaption>Example kurta set, pay on delivery.</figcaption>
    </figure>
  )
}

export function HomeFooter({ links }: { links: { href: string; label: string }[] }) {
  return (
    <footer className="s-foot"><div className="s-w">
      <Wordmark onInk thread className="h-5" />
      {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
      <a href={frataWhatsappLink()} target="_blank" rel="noopener">WhatsApp ·&nbsp;<b>{FRATA_WHATSAPP_DISPLAY}</b></a>
      <span>Made in India</span>
    </div></footer>
  )
}

export function SectionHead({ eyebrow, title, line, hindi }: { eyebrow: string; title: string; line?: ReactNode; hindi?: string }) {
  return (
    <div className="s-sec-head">
      <span className="s-eb">{eyebrow}</span>
      <h2>{title}</h2>
      {hindi && <p className="s-hi" lang="hi">{hindi}</p>}
      {line && <p>{line}</p>}
    </div>
  )
}
