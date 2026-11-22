import './globals.css' // the app sheet (Signal S2-0)
import './site.css' // the website's sheet (Rani Mela)
import Link from 'next/link'
import { SITE_FONT_VARS } from '@/components/brand/site-fonts'
import { ExampleOrderCard, HomeFooter, HomeHeader, NextTag, SectionHead, SiteIcon, SiteIconSprite, WhatsAppButton, WhatsAppNote, type SiteIconName } from '@/components/brand/site-home'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { paise } from '@/domains/money/paise'
import { exampleOrder } from '@/domains/orders/example'
import type { Feature } from '@/domains/plans/entitlements'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { publicPlansForPage } from '@/lib/db/platform'
import { formatInr } from '@/lib/format'

// =============================================================================
// The Frrata website's homepage in Rani Mela (owner-approved 2026-11-22; mockup
// docs/mockups/2026-11-17-homepage-rani-mela.html; plan docs/plans/2026-11-22-homepage-rani-mela.md). One feeling per
// scroll: this is for me, that's my problem, there's a fix, the terms are fair, I can do this, I know which plan, my
// last worry is gone, let's start. Every figure comes from the plans or the profit engine, never typed. Static,
// refreshed hourly; a plan change revalidates it (admin plans action).
// =============================================================================

export const revalidate = 3600
export const metadata = { title: { absolute: 'Frrata · Sell more, keep more, know your profit' }, description: 'Your store, COD and payments in one place, for Indian D2C brands.' }

const LEAKS: [SiteIconName, string, string][] = [
  ['return', 'COD parcels come back', 'You pay shipping both ways. You find out weeks later.'],
  ['apps', 'Ten apps, ten bills', 'Each fixes one thing. None of them talk to each other.'],
  ['guess', 'Revenue, not profit', 'You see what you sold. Not what you kept.'],
]
// The module each row shows, where there is one: its Next tag comes from the registry, never typed here.
const TILES: [SiteIconName, string, string, string, ModuleKey | null][] = [
  ['cod', 's-t-rani', 'Safe COD', 'Risky orders flagged before you ship.', null],
  ['profit', 's-t-mari', 'Real profit', 'Every order, after every cost.', 'true_profit'],
  ['ship', 's-t-pea', 'Shipping', 'PIN code checked. Slip printed.', 'delivery_zones'],
  ['chat', 's-t-neel', 'WhatsApp confirm', 'Fewer fake orders. Fewer returns.', 'rto_shield'],
]
const STEPS: [string, string, string, ModuleKey | null][] = [
  ['Open your store', 'Add products, sizes and prices.', 'Day 1', null],
  ['An order lands', 'COD risk read in a second.', '10:06 pm', null],
  ['Confirmed on WhatsApp', 'Packed, slip printed, picked up.', 'Next morning', 'rto_shield'],
  ['Delivered', 'Your real profit, right on the order.', 'Day 4', 'true_profit'],
]
const isNext = (k: ModuleKey | null) => k !== null && MODULES[k].status === 'next'
const TERMS: [string, string, string][] = [['₹0', 'fee on a parcel that comes back', 's-dot-rani'], ['1', 'afternoon to open your store', 's-dot-mari'], ['0', 'apps to install', 's-dot-pea']]
const FAQ = [
  ['Do I need a developer?', 'No. Everything is set in the console.'],
  ['A COD parcel comes back?', 'No Frrata fee on it.'],
  ['Do I need Razorpay to start?', 'No. Take pay-on-delivery orders from day one.'],
  ['Moving from Shopify?', 'Product import is next. Your old store runs until you switch.'],
] as const

export default async function Home() {
  const plans = await publicPlansForPage('home')
  const launch = plans.find((p) => p.code === 'launch')
  const order = launch ? exampleOrder(launch.feeBps) : null
  const maxFee = plans.length ? Math.max(...plans.map((p) => p.feeBps)) / 100 : null
  const start = (cls = 's-btn s-btn-rani') => <Link href="/start" className={cls}>Start your store free</Link>
  return (
    <div data-shell data-site className={`min-h-dvh ${SHELL_FONT_VARS} ${SITE_FONT_VARS}`}>
      <SiteIconSprite />
      <HomeHeader links={[{ href: '#how', label: 'How it works' }, { href: '#pricing', label: 'Pricing' }, { href: '#questions', label: 'Questions' }, { href: '/partners', label: 'Partners' }, { href: '/login', label: 'Sign in' }]} action={{ href: '/start', label: 'Start free' }} />
      <main id="content" tabIndex={-1} className="outline-none">

        {/* 1 · This is for me */}
        <section className="s-hero">
          <div className="s-shapes" aria-hidden="true"><span className="s-sh-q" /><span className="s-sh-c" /><span className="s-sh-d" /></div>
          <div className="s-w s-hero-grid">
            <div className="s-hero-copy">
              <span className="s-chip s-chip-neel s-in"><i />For Indian D2C brands</span>
              <h1 className="s-in s-d1">Sell more. Keep more. <em>Know your profit.</em></h1>
              <p className="s-hi s-in s-d2" lang="hi">हर ऑर्डर का असली मुनाफ़ा</p>
              <p className="s-lead s-in s-d3">Your store, COD and payments in one place. See what every order really earned.</p>
              <div className="s-ctas s-in s-d4">{start()}<a href="#how" className="s-btn s-btn-ghost">See how it works</a></div>
              <p className="s-in s-d4"><WhatsAppNote /></p>
            </div>
            {order && (
              <div className="s-stage s-in s-d3">
                <ExampleOrderCard order={order} />
                <div className="s-toast s-in s-d5" aria-hidden="true">
                  <span className="s-mk"><SiteIcon name="tick" className="" /></span>
                  <div>Confirmed on WhatsApp <NextTag /><small>KS-5013 · Jaipur · COD</small></div>
                </div>
              </div>
            )}
          </div>
          <ul role="list" className="s-w s-terms" aria-label="Our terms">
            {TERMS.map(([n, l, dot]) => <li key={l}><span className={`s-dot ${dot}`} /><b>{n}</b> {l}</li>)}
          </ul>
        </section>

        {/* 2 · That's my problem */}
        <section className="s-sec s-pain"><div className="s-w">
          <SectionHead eyebrow="Sound familiar?" title="Big sales. Small bank balance." hindi="बिक्री बहुत, मुनाफ़ा कम?" />
          <ul role="list" className="s-leaks">
            {LEAKS.map(([icon, t, d]) => <li key={t} className="s-leak"><SiteIcon name={icon} /><h3>{t}</h3><p>{d}</p></li>)}
          </ul>
        </div></section>

        {/* 3 · There's a fix */}
        <section className="s-sec s-relief"><div className="s-w">
          <SectionHead eyebrow="One console" title="Every rupee, counted." line="Store, checkout, COD, shipping and profit. Built together, so nothing slips." />
          <ul role="list" className="s-tiles">
            {TILES.map(([icon, tone, t, d, m]) => <li key={t} className={`s-tile ${tone}`}><SiteIcon name={icon} /><h3>{t}</h3><p>{d}</p>{isNext(m) && <span><NextTag /></span>}</li>)}
          </ul>
        </div></section>

        {/* 4 · The terms are fair */}
        <section className="s-band" aria-labelledby="terms-h"><div className="s-w">
          <h2 id="terms-h">Fair terms. Written in numbers.</h2>
          <dl>
            {[...TERMS.slice(0, 1), ...(maxFee !== null ? [[`${maxFee.toLocaleString('en-IN')}%`, 'at most, on delivered orders']] : []), ...TERMS.slice(1)].map(([n, l]) => <div key={l}><dt>{l}</dt><dd>{n}</dd></div>)}
          </dl>
        </div></section>

        {/* 5 · I can do this */}
        <section id="how" className="s-sec s-how"><div className="s-w">
          <SectionHead eyebrow="How it works" title="Your first order, start to finish." />
          <ol role="list" className="s-steps">
            {STEPS.map(([t, d, when, m], i) => (
              <li key={t} className="s-step"><span className="s-n" aria-hidden="true">{i + 1}</span><h3>{t}</h3><p>{d}</p><span className="s-when">{when}</span>{isNext(m) && <span><NextTag /></span>}</li>
            ))}
          </ol>
        </div></section>

        {/* 6 · I know which plan */}
        <section id="pricing" className="s-sec s-pricing"><div className="s-w">
          <SectionHead eyebrow="Pricing" title="Pricing, in rupees." line="No setup fee. No fee on parcels that come back." />
          {plans.length ? (
            <div className="s-plans">
              {plans.map((p) => {
                const pop = p.code === 'growth'
                return (
                  <div key={p.code} className={`s-plan${pop ? ' s-pop' : ''}`}>
                    {pop && <span className="s-chip s-chip-marigold">Most brands pick this</span>}
                    <h3>{p.name}</h3>
                    <p className="s-price"><b>{formatInr(paise(p.monthlyPrice))}</b><span>/ month + 18% GST</span></p>
                    <p className="s-fee"><b>{(p.feeBps / 100).toLocaleString('en-IN')}%</b> of each delivered order</p>
                    <ul role="list">
                      <li><SiteIcon name="tick" className="" />Up to {p.includedOrders.toLocaleString('en-IN')} orders a month</li>
                      {p.features.map((f) => <li key={f}><SiteIcon name="tick" className="" /><span>{FEATURE_NAMES[f as Feature] ?? f} {f in MODULES && isNext(f as ModuleKey) && <NextTag />}</span></li>)}
                    </ul>
                    <Link href="/start" className={`s-btn ${pop ? 's-btn-rani' : 's-btn-ghost'}`}>Start free</Link>
                  </div>
                )
              })}
            </div>
          ) : <p className="s-empty">Prices appear when you start your store.</p>}
        </div></section>

        {/* 7 · My last worry is gone */}
        <section id="questions" className="s-sec"><div className="s-w s-faq-grid">
          <div className="s-ask">
            <h2>Questions?</h2>
            <p className="s-hi" lang="hi">पूछिए, हम बताएँगे</p>
            <p>A real person answers on WhatsApp.</p>
            <WhatsAppButton />
          </div>
          <div>
            {FAQ.map(([q, a], i) => (
              <details key={q} className="s-qa" open={i === 0}>
                <summary>{q}<span className="s-pm" aria-hidden="true"><SiteIcon name="plus" className="" /></span></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div></section>

        {/* 8 · Let's start */}
        <section className="s-final"><div className="s-w">
          <h2>Open your store this week.</h2>
          <p className="s-hi" lang="hi">इसी हफ़्ते, अपना स्टोर</p>
          <div className="s-ctas">{start('s-btn s-btn-white')}<WhatsAppNote /></div>
        </div></section>
      </main>
      <HomeFooter links={[{ href: '/partners', label: 'For partners' }, { href: '/build-that-converts', label: 'Build that converts' }, { href: '/privacy-policy', label: 'Privacy' }, { href: '/login', label: 'Sign in' }]} />
    </div>
  )
}
