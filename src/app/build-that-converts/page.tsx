import './../globals.css' // the app sheet (Signal S2-0)
import Link from 'next/link'
import { BuyerJourney } from '@/components/brand/illustrations'
import { NumberBand, Selvedge, SiteFooter, SiteHeader, SiteStage, WhatsAppLine } from '@/components/brand/site'
import { Icon, type IconName } from '@/components/icons/icon'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { button } from '@/components/ui/button'

// =============================================================================
// FRRATA — "Build that converts" (spec docs/specs/2026-11-16-build-that-converts.md; mockup
// docs/mockups/2026-11-16-build-that-converts.html; owner-approved 2026-11-16). A cornerstone public page: eight
// of Frrata's own checkout and storefront decisions, each grounded in how a buyer decides. Fewer words, more
// pictures (website spec W·1). Static; no merchant data, no tenant.
// =============================================================================

export const revalidate = 3600
export const metadata = { title: { absolute: 'Build a store that converts · Frrata' }, description: 'Eight calls, each grounded in how a buyer decides.' }

const CARDS: [IconName, string, string][] = [
  ['confirmed', 'One tap to buy', 'Skip the cart. Buy in one tap.'],
  ['key', 'No signup wall', 'Buy first. The account comes after.'],
  ['slip', 'Price shown upfront', 'Full cost on the page. No surprise at checkout.'],
  ['cod', 'COD priced fair', 'Price the risk. Never punish the buyer.'],
  ['reviews', 'Reviews that fit', 'Matched to size and fit. Not sorted by stars alone.'],
  ['stock', 'Real stock only', "Say what's true. No fake timers."],
  ['returned', 'Returns as easy as buying', 'One tap to start. No ticket, no wait.'],
  ['search', 'Search that gets it', 'Say it your way. Find it anyway.'],
]

export default function BuildThatConverts() {
  const start = <Link href="/start" className={button({ variant: 'inverse', size: 'lg' })}>Start your shop free</Link>
  return (
    <div data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[{ href: '/', label: 'For brands' }, { href: '/partners', label: 'Partners' }, { href: '/login', label: 'Sign in' }]} action={{ href: '/start', label: 'Start free' }} /></SiteStage>
      <main id="content" tabIndex={-1} className="outline-none">
      <SiteStage>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:px-8 md:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-6">
            <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] font-semibold tracking-tight">Build a store that converts.</h1>
            <p className="max-w-md text-lg text-primary-foreground/70">Eight calls, each grounded in how a buyer decides.</p>
            <div className="flex flex-wrap items-center gap-4">{start}<WhatsAppLine /></div>
          </div>
          <BuyerJourney className="w-full" />
        </section>
      </SiteStage>
      <Selvedge />
      <NumberBand label="How a buyer decides" items={[['1', 'Sees it'], ['2', 'Trusts it'], ['3', 'Buys it']]} />

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="mb-2 font-display text-3xl font-semibold tracking-tight">Every click a shopper skips is a sale you keep.</h2>
          <p className="mb-10 max-w-2xl text-muted-foreground">Eight ways a store earns the buy, not just the visit.</p>
          <ul data-tinge className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CARDS.map(([icon, t, d]) => (
              <li key={t} className="grid gap-3 rounded-xl border border-border bg-card p-5">
                <span className="grid size-12 place-items-center rounded-lg bg-muted"><Icon name={icon} className="size-6" /></span>
                <b className="text-base">{t}</b><p className="text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <SiteStage>
          <section className="mx-auto grid max-w-6xl justify-items-start gap-6 px-4 py-14 sm:px-8">
            <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-tight">This is how Frrata builds your checkout.</h2>
            <div className="flex flex-wrap items-center gap-4">{start}<WhatsAppLine /></div>
          </section>
        </SiteStage>
      </main>
      <SiteFooter links={[{ href: '/', label: 'For brands' }, { href: '/partners', label: 'For partners' }, { href: '/privacy-policy', label: 'Privacy' }, { href: '/login', label: 'Sign in' }]} />
    </div>
  )
}
