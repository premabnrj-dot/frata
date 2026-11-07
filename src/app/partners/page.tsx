import Link from 'next/link'
import { EarningsPreview } from '@/components/brand/console-preview'
import { PartnerLoop, PictoTile } from '@/components/brand/illustrations'
import type { PictogramName } from '@/components/brand/pictogram'
import { NumberBand, Selvedge, SiteFooter, SiteHeader, SiteStage, WhatsAppLine } from '@/components/brand/site'
import { Money } from '@/components/data/numeric'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { EXAMPLE_BRAND, shareExample, shareTable } from '@/domains/partners/example'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { publicPlansForPage, type PublicPlan } from '@/lib/db/platform'
import { formatInr } from '@/lib/format'

// =============================================================================
// FRRATA PARTNERS — the public page for developers, designers and agencies (website spec W·1; owner 2026-11-07:
// fewer words, more pictures). The rate and its term in the hero, a partner's workspace drawn beside it, the terms
// in a Neel band, a calculator with no script (radio chips over shareTable()), the loop as a drawing, the rules as
// pictograms. Every figure comes from the Launch plan and PARTNER_TERMS. Static, refreshed hourly.
// =============================================================================

export const revalidate = 3600
const T = PARTNER_TERMS
const TERM = T.shareMonths % 12 === 0 ? `${T.shareMonths / 12} years` : `${T.shareMonths} months`
export const metadata = { title: { absolute: 'Partners · Frrata' }, description: `Build fashion brands’ shops on Frrata. Earn ${T.shareBps / 100}% of what we earn from them, for ${T.shareMonths} months.` }

const STEPS: [PictogramName, string, string][] = [
  ['build', 'Build', 'In your workspace.'],
  ['handover', 'Hand over', 'The brand owns it.'],
  ['earn', 'Earn', `${T.shareBps / 100}% for ${T.shareMonths} months.`],
]
const RULES: [PictogramName, string, string][] = [
  ['shield', 'The brand owns the store', 'Its customers and data too.'],
  ['owner', 'The brand can remove you', `Your share then runs ${T.noticeDays} more days.`],
  ['clients', 'One partner per store', 'A shop the brand made itself stays theirs.'],
  ['delivered', 'Fees only on delivered orders', 'A refused parcel earns nobody anything.'],
]
const FAQ: [string, string][] = [
  ['Do I need to code?', 'No. Everything is set in the console.'],
  ['Does the brand pay more?', 'No. Your share comes from our fee.'],
  ['When do the months start?', 'When the shop opens. Building time doesn’t count.'],
  ['What do you need to pay me?', 'PAN and a bank account. GSTIN if you have one.'],
]
const CLIENTS = ['Kesar Studio', 'Noor Handloom', 'Indigo Lane', 'Saffron Thread', 'Kaveri Weaves']

async function launchPlan(): Promise<PublicPlan | null> {
  return (await publicPlansForPage('partners')).find((p) => p.code === 'launch') ?? null
}

export default async function PartnersPage() {
  const plan = await launchPlan()
  const ex = plan ? shareExample(plan) : null
  const apply = <Link href="/partners/apply" className={button({ variant: 'inverse', size: 'lg' })}>Apply</Link>
  const wa = 'Hi Frrata, I build shops for brands. About the partner program.'
  return (
    <div data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage>
        <SiteHeader section="Partners" links={[{ href: '/', label: 'For brands' }, { href: '/login', label: 'Sign in' }]} action={{ href: '/partners/apply', label: 'Apply' }} />
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:px-8 md:grid-cols-[1fr_1fr]">
          <div className="grid gap-6">
            <p className="text-xs font-semibold tracking-widest text-primary-foreground/70 uppercase">For developers, designers and agencies</p>
            <h1 className="font-display text-[clamp(2.5rem,6vw,4rem)] leading-[1.02] font-semibold tracking-tight">Build brands’ shops.<br />Earn <span className="font-mono text-brand-on-ink">{T.shareBps / 100}%</span> for {TERM}.</h1>
            <p className="max-w-md text-lg text-primary-foreground/70">You build. The brand owns it. We pay you from our fee.</p>
            <div className="flex flex-wrap items-center gap-4">{apply}<WhatsAppLine text={wa} /></div>
          </div>
          {ex ? <EarningsPreview share={ex.share} brands={CLIENTS} /> : <PartnerLoop className="w-full max-w-lg justify-self-center" />}
        </section>
      </SiteStage>
      <Selvedge />

      <main id="content" tabIndex={-1} className="outline-none">
        <NumberBand label="The terms" items={[[`${T.shareBps / 100}%`, 'of what Frrata collects'], [`${T.shareMonths}`, 'months, from opening'], ['₹0', 'added to the brand’s price'], [`${T.maxUnopened}`, 'shops in progress, free']]} />

        {ex && (
          <section aria-labelledby="earn" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
            <h2 id="earn" className="mb-6 flex items-center font-display text-3xl font-semibold tracking-tight">What you’d earn
              <InfoTip about="this example">Example, not a promise: each brand on {ex.plan} with {EXAMPLE_BRAND.deliveredOrders} delivered orders of {formatInr(EXAMPLE_BRAND.orderValue)} a month. Frrata collects <Money paise={ex.frataCollects} /> from it; you get {T.shareBps / 100}%.</InfoTip>
            </h2>
            <fieldset className="relative grid gap-4 pb-40 md:pb-32">
              <legend className="mb-3 text-sm text-muted-foreground">Brands you build for</legend>
              <div className="flex flex-wrap gap-2">
                {shareTable(ex).map((r) => (
                  <label key={r.brands} className="cursor-pointer rounded-full border border-input bg-card px-4 py-2 font-mono text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring [&:has(:checked)_[data-out]]:grid">
                    <input type="radio" name="brands" value={r.brands} defaultChecked={r.brands === 5} className="sr-only" />{r.brands}
                    <span data-out className="absolute inset-x-0 bottom-0 hidden gap-2 rounded-xl bg-primary p-5 font-sans text-primary-foreground sm:grid-cols-2">
                      <span className="grid"><span className="text-sm font-normal text-primary-foreground/70">Each month</span><span className="font-mono text-3xl"><Money paise={r.perMonth} /></span></span>
                      <span className="grid"><span className="text-sm font-normal text-primary-foreground/70">Over {T.shareMonths} months</span><span className="font-mono text-3xl"><Money paise={r.overTerm} /></span></span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-3 text-sm text-muted-foreground">Example · ex GST · paid monthly once Frrata billing starts.</p>
          </section>
        )}

        <section aria-labelledby="how" className="mx-auto grid max-w-6xl items-center gap-10 border-t border-border px-4 py-16 sm:px-8 md:grid-cols-[1fr_1fr]">
          <div className="grid gap-6">
            <h2 id="how" className="font-display text-3xl font-semibold tracking-tight">Build, hand over, earn</h2>
            <ol className="grid gap-4">
              {STEPS.map(([icon, title, line], i) => (
                <li key={title} className="flex items-center gap-4"><PictoTile name={icon} tone={i === 2 ? 'haldi' : 'paper'} /><div><p className="text-lg font-semibold">{title}</p><p className="text-sm text-muted-foreground">{line}</p></div></li>
              ))}
            </ol>
          </div>
          {ex && <PartnerLoop className="w-full max-w-lg justify-self-center" />}
        </section>

        <section aria-labelledby="rules" className="mx-auto max-w-6xl border-t border-border px-4 py-16 sm:px-8">
          <h2 id="rules" className="mb-8 font-display text-3xl font-semibold tracking-tight">The rules</h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {RULES.map(([icon, title, line]) => (
              <li key={title} className="flex flex-col items-start gap-3"><PictoTile name={icon} /><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{line}</p></li>
            ))}
          </ul>
        </section>

        <section id="questions" aria-labelledby="faq" className="mx-auto max-w-3xl border-t border-border px-4 py-16 sm:px-8">
          <h2 id="faq" className="mb-4 font-display text-3xl font-semibold tracking-tight">Questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="border-b border-border py-3"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-muted-foreground">{a}</p></details>
          ))}
        </section>

        <SiteStage>
          <section className="mx-auto grid max-w-6xl justify-items-start gap-6 px-4 py-14 sm:px-8">
            <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-tight">Build your first shop this week.</h2>
            <div className="flex flex-wrap items-center gap-4">{apply}<WhatsAppLine text={wa} /></div>
          </section>
        </SiteStage>
      </main>
      <SiteFooter links={[{ href: '/', label: 'For brands' }, { href: '/login', label: 'Sign in' }]} />
    </div>
  )
}
