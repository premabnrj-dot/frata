import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
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
function Row({ href, icon, title, summary, needs = false, mono = false }: { href: string; icon: IconName; title: string; summary: string; needs?: boolean; mono?: boolean }) {
  return (
    <Link href={href} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border px-4 py-3 first:border-t-0 transition-colors duration-fast hover:bg-accent">
      <span aria-hidden="true" className="row-span-2 grid size-9 place-items-center rounded-md bg-muted"><Icon name={icon} className="size-5" /></span>
      <span className="font-medium">{title}</span>
      <span className="row-span-2 flex items-center">{needs ? <Badge tone="warn">Needs you</Badge> : <Icon name="chevron" className="size-4 text-muted-foreground" />}</span>
      <span className={`truncate text-sm text-muted-foreground ${mono ? 'font-mono' : ''}`}>{summary}</span>
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
      <PageHeader title="Settings" />
      <p className="-mt-2 text-sm text-muted-foreground">What you save here shows on your shop straight away.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section as="nav" flush ariaLabel="Settings">
          {SECTIONS.filter((s) => s.editors.includes(auth.membership.role)).map((s) => (
            <Row key={s.key} href={`/console/settings/${s.key}`} icon={SECTION_ICON[s.key]} title={s.title} summary={summary[s.key]} needs={needs(s.key)} />
          ))}
          {owner && <Row href="/console/settings/online-payments" icon="payments" title="Online payments" summary={online} needs={onlineNeeds} />}
          {manages && <Row href="/console/settings/billing" icon="plans" title="Plan and billing" summary="Your plan, this month so far, invoices and billing details" />}
          {manages && <Row href="/console/settings/people" icon="people" title="People" summary="Who works on this shop" />}
          <Row href="/console/settings/notifications" icon="bell" title="Your notifications" summary="What Frrata emails you" />
          {manages && <Row href="/console/settings/address" icon="address" title="Shop address" summary={mainHost} mono />}
          {seen !== null && (seen === undefined || seen.visible) && <Row href="/console/settings/shipping-costs" icon="shipped" title="Shipping costs" summary={shipSummary} needs={shipNeeds} />}
        </Section>
        <aside className="space-y-3">
          <Section>
            <h2 className="text-section font-semibold">Ready for live payments</h2>
            {missing.length ? (
              <>
                <p className="text-sm text-muted-foreground">Razorpay checks your shop for these before it turns on live UPI and cards. The law asks for them too.</p>
                <ul className="space-y-1 text-sm">{missing.map((m) => <li key={m.label}><Link href={`/console/settings/${m.section}`} className="text-warn-text underline">{m.label}</Link></li>)}</ul>
              </>
            ) : <p className="text-sm text-ok-text">Your business details, contacts and grievance officer are all set.</p>}
          </Section>
          <p className="px-1 text-xs text-muted-foreground">Coming later: your own domain and email templates.</p>
        </aside>
      </div>
    </>
  )
}
