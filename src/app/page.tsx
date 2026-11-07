import Link from 'next/link'
import { button } from '@/components/ui/button'
import { paise } from '@/domains/money/paise'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import type { Feature } from '@/domains/plans/entitlements'
import { publicPlans, type PublicPlan } from '@/lib/db/platform'
import { formatInr } from '@/lib/format'
import { FRATA_WHATSAPP_DISPLAY, frataWhatsappLink } from '@/lib/site'

// =============================================================================
// The Frata website's homepage, on the console host (frata-design-language §
// Phase 1): one promise, one primary action, every feature marked Now or Next,
// prices read from the plans themselves (never a copy), GST stated, the fee
// "only on delivered orders". Static, refreshed hourly; no client script.
// =============================================================================

export const revalidate = 3600

const NOW = [
  ['Sizes that fit', 'Size buttons with sold-out shown, a chart for each product type in cm and inches, the model’s height and size.'],
  ['Pay on delivery, on your terms', 'An order limit, pincodes you do not serve, a fee shown before ordering, and flags on repeat orders from one number.'],
  ['A quick shop on any phone', 'Pages built to load in under two seconds on 4G. Shoppers see if you deliver to their pincode before the bag.'],
] as const
const NEXT = [
  ['WhatsApp confirmation', 'Every Pay on delivery order confirmed on WhatsApp within minutes.'],
  ['Shipping with Shiprocket', 'Labels, tracking and failed deliveries in the same order queue.'],
  ['Profit on every order', 'What you kept after cost, shipping, fees and returns, order by order.'],
] as const
const FAQ = [
  ['Do I need a developer?', 'No. Products, sizes, Pay on delivery rules, your logo and colours are all set in the console.'],
  ['I sell on Shopify now. Can I move?', 'Yes. Export your products from Shopify and import the file here as it is. Your old shop keeps running until you switch.'],
  ['Do I need Razorpay or KYC to start?', 'No. Your shop can take Pay on delivery orders without it. Connect Razorpay, with its KYC, when you want UPI and card payments.'],
  ['What happens when a COD parcel is refused?', 'You pay no Frata fee on it. The fee is only on orders that are delivered.'],
  ['Is there a free trial? Do I need a card?', 'You build and preview your whole shop free, with no card. You choose a plan when you open your shop to shoppers.'],
  ['Can I use my own domain?', 'Your shop starts at a free address on Frata. Your own domain comes in a later release.'],
] as const

async function plansOrNone(): Promise<PublicPlan[]> {
  try { return await publicPlans() } catch (err) { console.error('[home] plans', err instanceof Error ? err.message : err); return [] }
}

export default async function Home() {
  const plans = await plansOrNone()
  const start = <Link href="/start" className={button({ size: 'lg' })}>Start your shop free</Link>
  return (
    <div className="min-h-dvh bg-card">
      <header className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-4 sm:px-8">
        <span className="text-lg font-semibold text-brand">Frata</span>
        <span className="flex-1" />
        <a href="#how" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">How it works</a>
        <a href="#pricing" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Pricing</a>
        <a href="#questions" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Questions</a>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
        <Link href="/start" className={button()}>Start free</Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 border-t border-border px-4 py-14 sm:px-8 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="text-[clamp(2rem,4.6vw,3rem)] font-bold leading-[1.08] tracking-tight">
              A shop for your fashion label that <span className="text-brand">keeps more of every order</span> you deliver.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Sizes and colours done properly, Pay on delivery with your rules, UPI and cards. Built for Indian brands that sell on Instagram and have no developer.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">{start}<a href="#how" className="text-sm underline">See how it works</a></div>
            <p className="mt-3 text-sm text-muted-foreground">No card needed. Take Pay on delivery orders on day one; connect Razorpay when you are ready.</p>
          </div>
          <div aria-label="Example: one order in the Frata console" className="space-y-2.5 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="flex items-center justify-between"><b className="font-mono">KS-1043</b><span className="rounded bg-warn px-2 py-0.5 text-xs font-medium text-warn-text">COD · ₹2,490 to collect</span></div>
            <p className="text-muted-foreground">Ananya R. · Indore 452018 · Linen kurta set, Indigo, M</p>
            <div className="rounded-md border-l-[3px] border-ok-text bg-card px-3 py-2">
              <b>Low risk · confirm and pack</b>
              <p className="text-muted-foreground">Full address with a house number · first order from this phone</p>
            </div>
            <div className="flex justify-between"><span>You sell at</span><span className="font-mono">₹2,490</span></div>
            <div className="flex justify-between"><span>Frata fee on Launch, only if delivered</span><span className="font-mono">2%</span></div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>If the parcel comes back</span><span className="font-mono">₹0 fee</span></div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">From sign-up to your first order in an afternoon</h2>
          <p className="mt-1 text-muted-foreground">Three steps. Everything else waits until you need it.</p>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[['Name your shop', 'Your email and your shop’s name. Your shop’s address is ready at once.'],
              ['Add your products', 'Photos, sizes and colours in one grid, a size chart per product type. Moving from Shopify? Import its product file as it is.'],
              ['Share and confirm', 'Put the link in your Instagram bio. Orders land in one queue; confirm Pay on delivery orders before you pack them.']]
              .map(([t, d], i) => (
                <li key={t} className="rounded-md border border-border p-4">
                  <span className="font-mono text-xs text-brand">{i + 1}</span>
                  <b className="mt-1 block">{t}</b>
                  <p className="mt-1 text-sm text-muted-foreground">{d}</p>
                </li>
              ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">What is in it</h2>
          <p className="mt-1 text-muted-foreground">Marked by what works today and what arrives next.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[...NOW.map(([t, d]) => ({ t, d, now: true })), ...NEXT.map(([t, d]) => ({ t, d, now: false }))].map((f) => (
              <div key={f.t} className="rounded-md border border-border p-4">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${f.now ? 'bg-ok text-ok-text' : 'bg-info text-info-text'}`}>{f.now ? 'Now' : 'Next'}</span>
                <b className="mt-2 block">{f.t}</b>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-1 text-muted-foreground">Prices exclude 18% GST; you get a GST invoice. The order fee is charged only on orders that are delivered, never on a parcel that comes back.</p>
          {plans.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.code} className={`flex flex-col gap-2 rounded-md border p-4 ${p.code === 'growth' ? 'border-primary' : 'border-border'}`}>
                  <b>{p.name}</b>
                  <p><span className="font-mono text-3xl font-semibold">{formatInr(paise(p.monthlyPrice))}</span><span className="text-sm text-muted-foreground"> / month</span></p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono">{(p.feeBps / 100).toLocaleString('en-IN')}%</span> of each delivered order · up to{' '}
                    <span className="font-mono">{p.includedOrders.toLocaleString('en-IN')}</span> orders a month
                  </p>
                  {p.features.length > 0 && (
                    <p className="text-sm text-muted-foreground">Includes, as each arrives: {p.features.map((f) => FEATURE_NAMES[f as Feature] ?? f).join(', ')}</p>
                  )}
                  <Link href="/start" className={button({ variant: p.code === 'growth' ? 'primary' : 'secondary', className: 'mt-auto' })}>Start free</Link>
                </div>
              ))}
            </div>
          ) : <p className="mt-6 text-sm text-muted-foreground">Prices are shown when you start your shop.</p>}
        </section>

        <section id="questions" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-4 max-w-3xl">
            {FAQ.map(([q, a]) => (
              <details key={q} className="border-b border-border py-3">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-2 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">{start}<a href={frataWhatsappLink()} target="_blank" rel="noopener" className="text-sm underline">Ask us on WhatsApp</a></div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-8">
        <span className="font-semibold text-brand">Frata</span>
        <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="hover:text-foreground">WhatsApp us · <span className="font-mono">{FRATA_WHATSAPP_DISPLAY}</span></a>
        <span>Made in India</span>
        <Link href="/login" className="hover:text-foreground">Sign in</Link>
        <Link href="/start" className="hover:text-foreground">Start your shop</Link>
      </footer>
    </div>
  )
}
