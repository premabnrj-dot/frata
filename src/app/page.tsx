import Link from 'next/link'
import { ConsolePreview } from '@/components/brand/console-preview'
import { Journey } from '@/components/brand/journey'
import { NumberBand, Selvedge, SiteFooter, SiteHeader, SiteStage, WhatsAppLine } from '@/components/brand/site'
import { Icon, type IconName } from '@/components/icons/icon'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { button } from '@/components/ui/button'
import { paise } from '@/domains/money/paise'
import { exampleOrder } from '@/domains/orders/example'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import type { Feature } from '@/domains/plans/entitlements'
import { publicPlansForPage } from '@/lib/db/platform'
import { formatInr } from '@/lib/format'

// =============================================================================
// The Frrata website's homepage (website spec W·1, owner 2026-11-07: fewer words, more pictures). An ink stage with
// the console drawn as it is, a Neel band of terms, the order's journey as pictures, three cards, prices in ₹ read
// from the plans, four questions. Every figure comes from the plans or the profit engine, never typed. Static,
// refreshed hourly; a plan change revalidates it (admin plans action).
// =============================================================================

export const revalidate = 3600
export const metadata = { title: { absolute: 'Frrata · Keep more of every order you deliver' } }

const CARDS: [IconName, string, string][] = [
  ['size', 'Sizes that fit', 'A chart per product type. Sold-out sizes shown.'],
  ['cod', 'COD on your terms', 'Limits, pincodes, a fee, and repeat-number flags.'],
  ['shipped', 'Light on any phone', 'Made for 4G. Pincode checked before paying.'],
]
const FAQ = [
  ['Do I need a developer?', 'No. Everything is set in the console.'],
  ['A COD parcel comes back?', 'No Frrata fee on it.'],
  ['Do I need Razorpay to start?', 'No. Take pay-on-delivery orders from day one.'],
  ['Moving from Shopify?', 'Product import is next. Your old shop runs until you switch.'],
] as const

export default async function Home() {
  const plans = await publicPlansForPage('home')
  const launch = plans.find((p) => p.code === 'launch')
  const order = launch ? exampleOrder(launch.feeBps) : null
  const maxFee = plans.length ? Math.max(...plans.map((p) => p.feeBps)) / 100 : null
  const start = <Link href="/start" className={button({ variant: 'inverse', size: 'lg' })}>Start your shop free</Link>
  return (
    <div data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[{ href: '#how', label: 'How it works' }, { href: '#pricing', label: 'Pricing' }, { href: '/partners', label: 'Partners' }, { href: '/login', label: 'Sign in' }]} action={{ href: '/start', label: 'Start free' }} /></SiteStage>
      <main id="content" tabIndex={-1} className="outline-none">
      <SiteStage>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:px-8 md:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-6">
            <p className="text-xs font-semibold tracking-widest text-primary-foreground/70 uppercase">For fashion brands on Instagram</p>
            <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02] font-semibold tracking-tight">Keep more of every order you <span className="text-brand-on-ink">deliver</span>.</h1>
            <p className="max-w-md text-lg text-primary-foreground/70">Your shop, safe pay on delivery, and each order’s real profit.</p>
            <div className="flex flex-wrap items-center gap-4">{start}<WhatsAppLine /></div>
          </div>
          <ConsolePreview order={order} />
        </section>
      </SiteStage>
      <Selvedge />
        <NumberBand label="The terms" items={[['₹0', 'fee on a parcel that comes back'], ...(maxFee !== null ? [[`${maxFee.toLocaleString('en-IN')}%`, 'at most, on delivered orders'] as [string, string]] : []), ['1', 'afternoon to open'], ['0', 'apps to install']]} />

        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <h2 className="mb-10 font-display text-3xl font-semibold tracking-tight">One order, start to finish</h2>
          <Journey label="An order, step by step" steps={[{ icon: 'orders', title: 'Order lands' }, { icon: 'risk', title: 'Risk read' }, { icon: 'messages', title: 'Confirmed on WhatsApp', next: true }, { icon: 'pack', title: 'Packed, slip printed' }, { icon: 'profit', title: 'Profit, per order', next: true }]} />
        </section>

        <section className="mx-auto max-w-6xl border-t border-border px-4 py-16 sm:px-8">
          <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight">Built for Indian fashion</h2>
          <ul data-tinge className="grid gap-4 md:grid-cols-3">
            {CARDS.map(([icon, t, d]) => (
              <li key={t} className="grid gap-3 rounded-xl border border-border bg-card p-5">
                <span className="grid size-12 place-items-center rounded-lg bg-muted"><Icon name={icon} className="size-6" /></span>
                <b className="text-lg">{t}</b><p className="text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl border-t border-border px-4 py-16 sm:px-8">
          <h2 className="mb-8 font-display text-3xl font-semibold tracking-tight">Pricing, in rupees</h2>
          {plans.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.code} className={`flex flex-col gap-3 rounded-xl border bg-card p-5 ${p.code === 'growth' ? 'border-primary shadow-[inset_0_3px_0_var(--thread)]' : 'border-border'}`}>
                  <b className="font-display text-xl font-semibold">{p.name}</b>
                  <p><span className="font-mono text-3xl font-semibold">{formatInr(paise(p.monthlyPrice))}</span><span className="text-sm text-muted-foreground"> / month + 18% GST</span></p>
                  <p className="rounded-md bg-muted px-3 py-2 text-sm"><span className="font-mono font-semibold">{(p.feeBps / 100).toLocaleString('en-IN')}%</span> of each <b>delivered</b> order</p>
                  <p className="text-sm text-muted-foreground">Up to <span className="font-mono">{p.includedOrders.toLocaleString('en-IN')}</span> orders a month</p>
                  {p.features.length > 0 && <p className="text-sm text-muted-foreground">{p.features.map((f) => FEATURE_NAMES[f as Feature] ?? f).join(' · ')}</p>}
                  <Link href="/start" className={button({ variant: p.code === 'growth' ? 'primary' : 'secondary', className: 'mt-auto' })}>Start free</Link>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground">Prices appear when you start your shop.</p>}
        </section>

        <section id="questions" className="mx-auto max-w-3xl border-t border-border px-4 py-16 sm:px-8">
          <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight">Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="border-b border-border py-3">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2 text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>

        <SiteStage>
          <section className="mx-auto grid max-w-6xl justify-items-start gap-6 px-4 py-14 sm:px-8">
            <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-tight">Open your shop this week.</h2>
            <div className="flex flex-wrap items-center gap-4">{start}<WhatsAppLine /></div>
          </section>
        </SiteStage>
      </main>
      <SiteFooter links={[{ href: '/partners', label: 'For partners' }, { href: '/login', label: 'Sign in' }]} />
    </div>
  )
}
