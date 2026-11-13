import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/icons/icon'
import { Panel } from '@/components/ui/panel'
import { missingFacts, POLICY_PAGES, renderPolicy } from '@/domains/policies/render'
import { grievanceComplete, missingForLivePayments, SECTIONS, type SectionKey } from '@/domains/settings/sections'
import { paise } from '@/domains/money/paise'
import { estimateOf } from '@/domains/settings/ship-costs'
import { CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS, requireMember } from '@/lib/auth/require-member'
import { formatInr } from '@/lib/format'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { liveNamesFor, mainHostFor } from '@/lib/queries/addresses'
import { shipCostsSeenBy, shopWithSettings } from '@/lib/queries/settings'
import { paymentStatusFor } from '@/lib/queries/payments'
import { takesLivePayments } from '@/lib/payments/keys'
import { shopFacts } from './_components/facts'
import { Section } from '@/components/layout/section'
import { errName } from '@/lib/log'

export const metadata = { title: 'Settings' }

// One icon a row (visual changes, owner-approved 2026-11-08): the section is found by its picture as well as its name.
const SECTION_ICON: Record<SectionKey, IconName> = { store: 'merchants', contact: 'messages', brand: 'brand', policies: 'policy', payments: 'cod', shipping: 'ship', taxes: 'tax', documents: 'slip' }

/** A settings row: its icon, its name, what it holds now, and "Needs you" only when it does — else a chevron. */
/** One setting (Neel § Screens · Settings): a plain icon, its name, its current value at the right, "›". On a phone the
 * value goes under the name. Something to fix shows as a chip in the value's place. */
function Row({ href, icon, title, summary, needs = false, mono = false }: { href: string; icon: IconName; title: string; summary: string; needs?: boolean; mono?: boolean }) {
  return (
    <Link href={href} className="grid grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-x-3.5 gap-y-0.5 border-t border-line-soft px-4 py-3.5 first:border-t-0 transition-colors duration-fast hover:bg-side md:grid-cols-[20px_minmax(0,1fr)_minmax(0,380px)_16px] md:px-5">
      <Icon name={icon} className="row-span-2 size-5 text-muted-foreground md:row-span-1" />
      <span className="font-medium">{title}</span>
      <Icon name="chevron" className="row-span-2 size-4 text-muted-foreground md:order-last md:row-span-1" />
      <span className={`col-start-2 truncate text-label text-muted-foreground md:col-start-auto md:text-right ${mono ? 'font-mono' : ''}`}>{needs ? <Badge tone="warn" className="max-w-full overflow-hidden text-ellipsis">{summary}</Badge> : summary}</span>
    </Link>
  )
}

const inr = (p: number) => formatInr(paise(p))

export default async function SettingsPage() {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'You can’t change this shop’s settings' : auth.message} />
  const shop = await shopWithSettings(auth.membership.tenantId).catch((err) => { console.error('[settings]', errName(err)); return null })
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const f = shopFacts(shop, SHOP_DOMAIN)
  const pay = await paymentStatusFor(auth.membership.tenantId).catch(() => null)
  const mainHost = f.slug ? await mainHostFor(auth.membership.tenantId, f.slug).catch(() => shopHost(f.slug)) : ''
  const online = !pay ? 'Could not load' : !pay.connected ? 'Not connected: shoppers can pay on delivery only' : pay.problem ? 'Needs attention' : !pay.webhookSeenAt ? 'Connected · one step left in Razorpay' : pay.mode === 'test' ? 'Test mode' : 'Live · UPI, cards, netbanking'
  const onlineNeeds = !!pay && pay.connected && (!!pay.problem || !pay.webhookSeenAt)
  // D1·8: Razorpay fails live payments from an address not registered on the shop's account — the main one must be
  // approved (the merchant's word; checkout offers online payment only on an approved address).
  const names = takesLivePayments(pay) ? await liveNamesFor(auth.membership.tenantId).catch(() => []) : []
  const current = names.find((n) => !n.added)
  const missing: { label: string; section: string }[] = [...missingForLivePayments(f),
    ...(current && !current.razorpayOk ? [{ label: `Add ${shopHost(current.name)} in Razorpay`, section: 'address' }] : [])]
  const policyGaps = POLICY_PAGES.filter(([k]) => missingFacts(renderPolicy(k, f, inr)).length).length

  const summary: Record<SectionKey, string> = {
    store: `${f.shopName} · ${f.legalName || 'legal name missing'}`,
    contact: grievanceComplete(f) ? `${f.supportEmail} · grievance officer ${f.grievanceName}` : f.grievanceName ? 'Grievance officer’s email or phone missing' : 'Grievance officer missing',
    brand: f.tagline ? `“${f.tagline.slice(0, 40)}”` : 'Your logo and one line',
    policies: policyGaps ? `${policyGaps} of 5 pages are missing details` : `${f.returnKind === 'none' ? 'No returns' : `${f.returnDays}-day returns`} · 5 pages from your details`,
    payments: f.codOn ? `On, up to ${f.codMax ? inr(f.codMax) : 'any value'}${f.codCharge ? `, fee ${inr(f.codCharge)}` : ', no fee'}` : 'Off: shoppers pay online only',
    shipping: `${f.shippingFlat ? inr(f.shippingFlat) : 'Free'}${f.shippingFlat && f.freeShippingAbove ? `, free above ${inr(f.freeShippingAbove)}` : ''} · dispatched within ${f.dispatchDays} days`,
    taxes: f.gstin ? `GSTIN ${f.gstin} · tax invoices` : 'No GSTIN · bills of supply',
    documents: `${f.slipSize === 'label' ? '4×6 slips' : 'A4 slips'}${f.docSignatory ? ` · signed ${f.docSignatory}` : ' · no signatory yet'}`,
  }
  const manages = (CAN_MANAGE as readonly string[]).includes(auth.membership.role)
  const owner = auth.membership.role === 'owner'
  // Shipping costs: whoever seesCosts (owners and admins; a partner before handover). Staff never read them.
  const seen = (CAN_SET_COSTS as readonly string[]).includes(auth.membership.role) ? await shipCostsSeenBy(auth.membership.tenantId, auth.membership.role).catch(() => undefined) : null
  const ship = seen?.visible ? seen.costs : seen === undefined ? undefined : null
  const est = ship === undefined ? null : estimateOf(ship)
  const shipSummary = ship === undefined ? 'Could not load' : est ? `Delivery ${inr(est.delivery)} · return ${inr(est.ret)} · COD fee ${inr(est.codFee)}` : 'Not confirmed: profit says “before shipping costs”'
  const shipNeeds = ship !== undefined && !est
  const needs = (k: SectionKey) => missing.some((m) => m.section === k) || (k === 'policies' && policyGaps > 0)

  return (
    <>
      {/* Neel § Screens · Settings: one list, each row its current value; "Ready for live payments" a chip in the header. */}
      <PageHeader title="Settings" actions={missing.length ? <Badge tone="warn">{missing.length} to fix for live payments</Badge> : <Badge tone="ok">Ready for live payments</Badge>} />
      <div className="max-w-215 space-y-4">
        {missing.length ? (
          <Banner tone="warn" title="Before live payments">
            <span className="inline-flex flex-wrap gap-x-3">{missing.map((m) => <Link key={m.label} href={`/console/settings/${m.section}`} className="font-medium text-link hover:underline">{m.label}</Link>)}</span>
          </Banner>
        ) : null}
        <Section as="nav" flush ariaLabel="Settings">
          {SECTIONS.filter((s) => s.editors.includes(auth.membership.role)).map((s) => (
            <Row key={s.key} href={`/console/settings/${s.key}`} icon={SECTION_ICON[s.key]} title={s.title} summary={summary[s.key]} needs={needs(s.key)} />
          ))}
          {owner && <Row href="/console/settings/online-payments" icon="payments" title="Online payments" summary={online} needs={onlineNeeds} />}
          {manages && <Row href="/console/settings/billing" icon="plans" title="Plan and billing" summary="Your plan, this month so far, invoices and billing details" />}
          {manages && <Row href="/console/settings/people" icon="people" title="People" summary="Who works on this shop" />}
          <Row href="/console/settings/emails" icon="messages" title="Emails to shoppers" summary="Order emails in your shop’s name" />
          <Row href="/console/settings/notifications" icon="bell" title="Your notifications" summary="What Frrata emails you" />
          {manages && <Row href="/console/settings/address" icon="address" title="Shop address" summary={mainHost} mono />}
          {seen !== null && (seen === undefined || seen.visible) && <Row href="/console/settings/shipping-costs" icon="shipped" title="Shipping costs" summary={shipSummary} needs={shipNeeds} />}
        </Section>
      </div>
    </>
  )
}
