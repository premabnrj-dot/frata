import { Selvedge, SiteFooter, SiteHeader, SiteStage } from '@/components/brand/site'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { FRATA_PRIVACY_EMAIL, FRATA_WHATSAPP_DISPLAY, frataWhatsappLink } from '@/lib/site'

// =============================================================================
// FRRATA'S OWN PRIVACY POLICY — the platform's (frrata.shop and the console), not a brand's own shop. A brand
// running on Frrata publishes its own privacy policy for its shoppers (src/domains/policies/); this page is Frrata
// answering, as itself, for what it collects to run the console and its Meta (WhatsApp Business, Instagram)
// connections — owner, 2026-11-15, written for Meta's app review and kept accurate as integrations change.
// =============================================================================

export const metadata = { title: 'Privacy Policy' }

const UPDATED = '15 November 2026'

export default function PrivacyPolicy() {
  return (
    <div data-shell className={`min-h-dvh bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage><SiteHeader links={[{ href: '/', label: 'Home' }]} /></SiteStage>
      <Selvedge />
      <main id="content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-14 outline-none sm:px-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}.</p>

        <p className="mt-8 leading-7 text-muted-foreground">Frrata ("Frrata", "we", "us") builds the console that Indian fashion
          brands run their shop in: orders, cash-on-delivery, payments, shipping, and talking to shoppers on WhatsApp and
          Instagram. This page covers what Frrata itself collects, as the company behind that console and behind frrata.shop.
          A brand selling on Frrata publishes its own privacy policy, on its own shop, for its own shoppers — this page is
          not that; it is Frrata speaking for itself.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">What we collect</h2>
        <ul className="mt-3 grid gap-3 leading-7 text-muted-foreground">
          <li><b className="text-foreground">From a brand we work with:</b> name, email, phone, GST and business details, and whatever it
            types into the console — products, orders, settings.</li>
          <li><b className="text-foreground">From a shopper, on a brand's behalf:</b> name, phone, delivery address and order details, so the
            brand can fulfil that order. This belongs to the brand; Frrata processes it as the brand's service provider.</li>
          <li><b className="text-foreground">From Meta, when a brand connects WhatsApp Business or Instagram:</b> the connected account's basic
            profile and connection details, so Frrata can send and receive messages on that brand's behalf (order updates,
            delivery updates, replies) and show the brand its own conversations. We act only on that brand's own instruction,
            and never for a brand that has not made that connection itself.</li>
          <li><b className="text-foreground">Site use:</b> pages visited, device and browser, through our own first-party script — no
            third-party advertising trackers, no ad pixels.</li>
          <li><b className="text-foreground">Signing in:</b> a session cookie and a sign-in email or code, through Supabase Auth.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">What we never collect</h2>
        <ul className="mt-3 grid gap-3 leading-7 text-muted-foreground">
          <li>A shopper's card, UPI or bank details. Online payments go straight to the brand's own Razorpay account; a
            cash-on-delivery payment goes to the brand's courier. Frrata never holds either.</li>
          <li>Anything through a social sign-in, other than the WhatsApp Business or Instagram connection a brand itself sets up.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">How we use it</h2>
        <ul className="mt-3 grid gap-3 leading-7 text-muted-foreground">
          <li>To run the console: process orders, send the WhatsApp and email updates a brand asks for, work out shipping and
            cash-on-delivery risk, and bill the brand for using Frrata.</li>
          <li>To keep one brand's data away from another's — enforced in Frrata's database policies as well as its code.</li>
          <li>To improve Frrata, from aggregated, de-identified use only. We do not sell data, and we do not use a brand's or
            a shopper's data to train a model or for anyone's marketing but that brand's own.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Where it is stored</h2>
        <p className="mt-3 leading-7 text-muted-foreground">On servers in Mumbai, India, and processed by functions in the same
          region.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Who we share it with</h2>
        <p className="mt-3 leading-7 text-muted-foreground">Only the processor a feature needs, and only what that feature needs:
          Razorpay for payments, Shiprocket for shipping, Meta's WhatsApp Business API and Instagram messaging for a brand that
          connects them, and Amazon SES for sending email. None of them receives more than the order or message it is handling,
          and none may use it for its own purposes.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Your rights</h2>
        <p className="mt-3 leading-7 text-muted-foreground">Write to us below to see, correct or delete what we hold about you.
          We aim to acknowledge within 48 hours and resolve within 30 days. A shopper asking about one order is better served
          by that brand directly — it owns the order — but we will pass the request on either way.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Children</h2>
        <p className="mt-3 leading-7 text-muted-foreground">Frrata is a business tool, not directed at children; we do not
          knowingly collect a child's data.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Changes</h2>
        <p className="mt-3 leading-7 text-muted-foreground">We update this page when what we do changes, and move the date above.</p>

        <h2 className="mt-10 font-display text-xl font-semibold tracking-tight">Contact</h2>
        <p className="mt-3 leading-7 text-muted-foreground">Privacy questions and requests: <a className="select-all font-medium text-foreground underline underline-offset-2" href={`mailto:${FRATA_PRIVACY_EMAIL}`}>{FRATA_PRIVACY_EMAIL}</a>, or
          WhatsApp <a className="font-mono text-foreground underline underline-offset-2" href={frataWhatsappLink('Hi Frrata, I have a privacy question.')} target="_blank" rel="noopener">{FRATA_WHATSAPP_DISPLAY}</a>.</p>
      </main>
      <SiteFooter links={[{ href: '/', label: 'Home' }, { href: '/partners', label: 'For partners' }]} />
    </div>
  )
}
