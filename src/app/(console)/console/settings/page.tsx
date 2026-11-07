import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { missingFacts, POLICY_PAGES, renderPolicy } from '@/domains/policies/render'
import { grievanceComplete, missingForLivePayments, SECTIONS, type SectionKey } from '@/domains/settings/sections'
import { paise } from '@/domains/money/paise'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { formatInr } from '@/lib/format'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { shopWithSettings } from '@/lib/queries/settings'
import { paymentStatusFor } from '@/lib/queries/payments'
import { shopFacts } from './_components/facts'
import { Section } from '@/components/layout/section'

export const metadata = { title: 'Settings' }

const inr = (p: number) => formatInr(paise(p))

export default async function SettingsPage() {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'You can’t change this shop’s settings' : auth.message} />
  const shop = await shopWithSettings(auth.membership.tenantId).catch((err) => { console.error('[settings]', err); return null })
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const f = shopFacts(shop, SHOP_DOMAIN)
  const pay = await paymentStatusFor(auth.membership.tenantId).catch(() => null)
  const online = !pay ? 'Could not load' : !pay.connected ? 'Not connected: shoppers can pay on delivery only' : pay.problem ? 'Needs attention' : !pay.webhookSeenAt ? 'Connected · one step left in Razorpay' : pay.mode === 'test' ? 'Test mode' : 'Live · UPI, cards, netbanking'
  const onlineNeeds = !!pay && pay.connected && (!!pay.problem || !pay.webhookSeenAt)
  const missing = missingForLivePayments(f)
  const policyGaps = POLICY_PAGES.filter(([k]) => missingFacts(renderPolicy(k, f, inr)).length).length

  const summary: Record<SectionKey, string> = {
    store: `${f.shopName} · ${f.legalName || 'legal name missing'}`,
    contact: grievanceComplete(f) ? `${f.supportEmail} · grievance officer ${f.grievanceName}` : f.grievanceName ? 'Grievance officer’s email or phone missing' : 'Grievance officer missing',
    brand: `${f.displayFont[0]!.toUpperCase()}${f.displayFont.slice(1)} · ${f.accent}${f.tagline ? ` · “${f.tagline.slice(0, 40)}”` : ''}`,
    policies: policyGaps ? `${policyGaps} of 5 pages are missing details` : `${f.returnKind === 'none' ? 'No returns' : `${f.returnDays}-day returns`} · 5 pages from your details`,
    payments: f.codOn ? `On, up to ${f.codMax ? inr(f.codMax) : 'any value'}${f.codCharge ? `, fee ${inr(f.codCharge)}` : ', no fee'}` : 'Off: shoppers pay online only',
    shipping: `${f.shippingFlat ? inr(f.shippingFlat) : 'Free'}${f.shippingFlat && f.freeShippingAbove ? `, free above ${inr(f.freeShippingAbove)}` : ''} · dispatched within ${f.dispatchDays} days`,
    taxes: f.gstin ? `GSTIN ${f.gstin} · tax invoices` : 'No GSTIN · bills of supply',
  }
  const manages = (CAN_MANAGE as readonly string[]).includes(auth.membership.role)
  const owner = auth.membership.role === 'owner'
  const needs = (k: SectionKey) => missing.some((m) => m.section === k) || (k === 'policies' && policyGaps > 0)

  return (
    <>
      <PageHeader title="Settings" />
      <p className="-mt-2 text-sm text-muted-foreground">What you save here shows on your shop straight away.</p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section as="nav" flush ariaLabel="Settings">
          {SECTIONS.filter((s) => s.editors.includes(auth.membership.role)).map((s) => (
            <Link key={s.key} href={`/console/settings/${s.key}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border px-4 py-3 first:border-t-0 transition-colors duration-fast hover:bg-accent">
              <span className="font-medium">{s.title}</span>
              <Badge tone={needs(s.key) ? 'warn' : 'neutral'} className="row-span-2">{needs(s.key) ? 'Needs you' : 'Edit'}</Badge>
              <span className="truncate text-sm text-muted-foreground">{summary[s.key]}</span>
            </Link>
          ))}
          {owner && <Link href="/console/settings/online-payments" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border px-4 py-3 transition-colors duration-fast hover:bg-accent">
            <span className="font-medium">Online payments</span>
            <Badge tone={onlineNeeds ? 'warn' : 'neutral'} className="row-span-2">{onlineNeeds ? 'Needs you' : 'Edit'}</Badge>
            <span className="truncate text-sm text-muted-foreground">{online}</span>
          </Link>}
          {manages && <Link href="/console/settings/people" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border px-4 py-3 transition-colors duration-fast hover:bg-accent">
            <span className="font-medium">People</span>
            <Badge className="row-span-2">View</Badge>
            <span className="truncate text-sm text-muted-foreground">Who works on this shop</span>
          </Link>}
          {manages && <Link href="/console/settings/address" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border px-4 py-3 transition-colors duration-fast hover:bg-accent">
            <span className="font-medium">Shop address</span>
            <Badge className="row-span-2">Edit</Badge>
            <span className="truncate font-mono text-sm text-muted-foreground">{f.slug}.{SHOP_DOMAIN}</span>
          </Link>}
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
          <Section>
            <h2 className="text-section font-semibold">Coming later</h2>
            <p className="text-sm text-muted-foreground">Your own domain, team invitations, email templates and your Frata plan and bills come in later releases.</p>
          </Section>
        </aside>
      </div>
    </>
  )
}
