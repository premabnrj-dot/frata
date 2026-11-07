import Link from 'next/link'
import { PartnerLoop, PictoTile } from '@/components/brand/illustrations'
import type { PictogramName } from '@/components/brand/pictogram'
import { Money } from '@/components/data/numeric'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { EXAMPLE_BRAND, shareExample } from '@/domains/partners/example'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { publicPlans, type PublicPlan } from '@/lib/db/platform'
import { formatInr } from '@/lib/format'
import { frataWhatsappLink } from '@/lib/site'
import { Wordmark } from '@/components/brand/wordmark'

// =============================================================================
// FRATA PARTNERS — the public page for developers, designers and agencies
// (approved mockup screen 1; owner 2026-11-07: graphics over passages, the
// voice in frata-design-language § Voice). Pictures say the model; words are
// labels and numbers. Detail lives in (i) tips. Figures come from the plans
// themselves and PARTNER_TERMS, never typed. Static, refreshed hourly.
// =============================================================================

export const revalidate = 3600
export const metadata = { title: 'Frrata Partners', description: 'Build fashion brands’ shops on Frrata. Earn 20% of what we earn from them, for 24 months.' }

const T = PARTNER_TERMS
const STEPS: [PictogramName, string, string][] = [
  ['build', 'Build', 'In your workspace.'],
  ['handover', 'Hand over', 'The brand owns it.'],
  ['earn', 'Earn', `${T.shareBps / 100}% for ${T.shareMonths} months.`],
]
const RULES: [PictogramName, string, string][] = [
  ['shield', 'The brand owns the store', 'Its customers and data too. You work on it as its partner.'],
  ['owner', 'The brand can remove you', `Your share then runs ${T.noticeDays} more days.`],
  ['clients', 'One partner per store', 'A store the brand made itself can’t be claimed later.'],
  ['delivered', 'Fees only on delivered orders', 'A refused COD parcel costs the brand nothing, and earns nobody anything.'],
]
const NOW = ['All your client stores, one sign-in', `Up to ${T.maxUnopened} stores in progress, free`, 'Your share recorded per store']
const NEXT = ['Monthly statements and bank payouts', 'A monthly report for each client']
const FAQ: [string, string][] = [
  ['Do I need to code?', 'No. Everything is set up in the console.'],
  ['Does the brand pay more?', 'No. Your share comes out of Frrata’s fee.'],
  ['When does the 24 months start?', 'When the shop opens. Building time doesn’t count.'],
  ['My client already has a Frrata shop.', 'They can add you as staff. A store you didn’t build earns no share.'],
  ['What do you need to pay me?', 'PAN and a bank account, when your first share is due. GSTIN if you have one.'],
  ['When are payouts?', 'Monthly, once Frrata billing starts. Your share is recorded from day one.'],
]

async function launchPlan(): Promise<PublicPlan | null> {
  try { return (await publicPlans()).find((p) => p.code === 'launch') ?? null } catch (err) { console.error('[partners] plans', err instanceof Error ? err.message : err); return null }
}

export default async function PartnersPage() {
  const plan = await launchPlan()
  const ex = plan ? shareExample(plan) : null
  const apply = <Link href="/partners/apply" className={button({ size: 'lg' })}>Apply</Link>
  return (
    <div data-shell className={`min-h-dvh bg-card ${SHELL_FONT_VARS}`}>
      <header className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Frrata home" className="inline-flex min-h-6 items-center"><Wordmark thread label={null} className="h-6" /></Link>
        <span className="text-sm font-medium">Partners</span>
        <span className="flex-1" />
        <Link href="/" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">For brands</Link>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
        <Link href="/partners/apply" className={button()}>Apply</Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 border-t border-border px-4 py-14 sm:px-8 md:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <p className="text-sm font-medium text-muted-foreground">For developers, designers and agencies</p>
            <h1 className="font-display text-[clamp(2rem,4.6vw,3.25rem)] font-semibold leading-[1.05] tracking-tight">
              Build brands’ shops.<br />Earn <span className="font-mono">{T.shareBps / 100}%</span> for 2 years.
            </h1>
            <p className="text-lg text-muted-foreground">You build. The brand owns it. We pay you from our fee.</p>
            <div className="flex flex-wrap items-center gap-4">{apply}<a href={frataWhatsappLink('Hi Frrata, I build shops for brands. About the partner program.')} target="_blank" rel="noopener" className="text-sm underline">Ask on WhatsApp</a></div>
          </div>
          <PartnerLoop className="w-full max-w-lg justify-self-center" />
        </section>

        <section aria-label="How it works" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map(([icon, title, line], i) => (
              <li key={title} className="flex items-center gap-4">
                <PictoTile name={icon} tone={i === 2 ? 'haldi' : 'paper'} />
                <div><p className="font-mono text-xs text-muted-foreground">{i + 1}</p><p className="text-lg font-semibold">{title}</p><p className="text-sm text-muted-foreground">{line}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="The numbers" className="bg-illo-haldi-soft">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 sm:px-8 md:grid-cols-4">
            {[[`${T.shareBps / 100}%`, 'of what Frrata collects'], [`${T.shareMonths}`, 'months per store'], ['₹0', 'added to the brand’s price'], [`${T.maxUnopened}`, 'stores in progress, free']].map(([n, l]) => (
              <div key={l} className="flex flex-col-reverse gap-1"><dt className="text-sm">{l}</dt><dd className="font-mono text-4xl font-semibold tracking-tight">{n}</dd></div>
            ))}
          </dl>
        </section>

        {ex && (
          <section aria-labelledby="example" className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-8 md:grid-cols-[1fr_1.1fr]">
            <div className="space-y-2">
              <h2 id="example" className="flex items-center text-2xl font-semibold tracking-tight">One brand, one month
                <InfoTip about="this example">Example, not a promise. A brand on {ex.plan} with {EXAMPLE_BRAND.deliveredOrders} delivered orders of {formatInr(EXAMPLE_BRAND.orderValue)} (ex GST). Frrata charges {ex.feeBps / 100}% only on delivered orders. Paid when Frrata billing starts.</InfoTip>
              </h2>
              <p className="text-muted-foreground">The share grows when the brand delivers more.</p>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 rounded-lg border border-border bg-background p-5 text-sm">
              <dt className="text-muted-foreground">{ex.plan} plan</dt><dd className="text-right"><Money paise={ex.planFee} /></dd>
              <dt className="text-muted-foreground">{ex.feeBps / 100}% of {EXAMPLE_BRAND.deliveredOrders} delivered orders</dt><dd className="text-right"><Money paise={ex.orderFee} /></dd>
              <dt className="border-t border-border pt-2">Frrata collects</dt><dd className="border-t border-border pt-2 text-right"><Money paise={ex.frataCollects} /></dd>
              <dt className="text-base font-semibold">Your {T.shareBps / 100}%</dt><dd className="text-right text-base font-semibold"><Money paise={ex.share} decimals /> <span className="font-sans text-xs font-normal text-muted-foreground">/ month</span></dd>
            </dl>
          </section>
        )}

        <section aria-labelledby="rules" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 id="rules" className="text-2xl font-semibold tracking-tight">The rules</h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {RULES.map(([icon, title, tip]) => (
              <li key={title} className="flex flex-col items-start gap-3">
                <PictoTile name={icon} />
                <p className="flex items-center font-medium">{title}<InfoTip about={title.toLowerCase()}>{tip}</InfoTip></p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Now and next" className="mx-auto grid max-w-6xl gap-6 border-t border-border px-4 py-12 sm:px-8 md:grid-cols-2">
          {[['Now', NOW, 'bg-ok text-ok-text'], ['Next', NEXT, 'bg-info text-info-text']].map(([label, items, tone]) => (
            <div key={label as string} className="space-y-3">
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone as string}`}>{label as string}</span>
              <ul className="space-y-2">{(items as string[]).map((i) => <li key={i} className="font-medium">{i}</li>)}</ul>
            </div>
          ))}
        </section>

        <section id="questions" aria-labelledby="faq" className="mx-auto max-w-6xl border-t border-border px-4 py-12 sm:px-8">
          <h2 id="faq" className="text-2xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-4 max-w-3xl">
            {FAQ.map(([q, a]) => (
              <details key={q} className="border-b border-border py-3">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-2 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8">{apply}</div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 border-t border-border px-4 py-6 text-sm text-muted-foreground sm:px-8">
        <Wordmark className="h-4" />
        <Link href="/" className="hover:text-foreground">For brands</Link>
        <Link href="/login" className="hover:text-foreground">Sign in</Link>
        <span>Made in India</span>
      </footer>
    </div>
  )
}
