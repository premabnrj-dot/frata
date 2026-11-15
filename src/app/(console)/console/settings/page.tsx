import Link from 'next/link'
import { BackLink, PageHeader } from '@/components/layout/page-header'
import { groupFor, groupsFor, pageHref, pageTitle, type PageKey } from '@/domains/settings/groups'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/icons/icon'
import { Panel } from '@/components/ui/panel'
import { missingFacts, POLICY_PAGES, renderPolicy } from '@/domains/policies/render'
import { grievanceComplete, missingForLivePayments, type SectionKey } from '@/domains/settings/sections'
import { paise } from '@/domains/money/paise'
import { estimateOf } from '@/domains/settings/ship-costs'
import { CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS, requireMember } from '@/lib/auth/require-member'
import { formatInr } from '@/lib/format'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { liveNamesFor, mainHostFor } from '@/lib/queries/addresses'
import { shipCostsSeenBy, shopWithSettings } from '@/lib/queries/settings'
import { paymentStatusFor } from '@/lib/queries/payments'
import { planLine } from '@/lib/queries/billing'
import { takesLivePayments } from '@/lib/payments/keys'
import { shopFacts } from './_components/facts'
import { Section } from '@/components/layout/section'
import { errName } from '@/lib/log'

export const metadata = { title: 'Settings' }

/** One page of a group (Neel § Screens · Settings, regrouped 2026-11-15): its name, its current value at the right, a chevron.
 * On a phone the value goes under the name. Something to fix shows as a chip in the value's place. */
function Row({ href, title, summary, needs = false, mono = false }: { href: string; title: string; summary: string; needs?: boolean; mono?: boolean }) {
  return (
    <Link href={href} className="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-x-3.5 gap-y-0.5 border-t border-line-soft px-4 py-3.5 first:border-t-0 transition-colors duration-fast hover:bg-side md:grid-cols-[minmax(0,1fr)_minmax(0,360px)_16px] md:px-5">
      <span className="font-medium">{title}</span>
      <Icon name="chevron" className="row-span-2 size-4 text-muted-foreground md:order-last md:row-span-1" />
      <span className="col-start-1 truncate text-label text-muted-foreground md:col-start-auto md:text-right">{needs ? <Badge tone="warn" className="max-w-full overflow-hidden text-ellipsis">{summary}</Badge> : <span className={mono ? 'font-mono' : undefined}>{summary}</span>}</span>
    </Link>
  )
}

const inr = (p: number) => formatInr(paise(p))

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'You can’t change this store’s settings' : auth.message} />
  const shop = await shopWithSettings(auth.membership.tenantId).catch((err) => { console.error('[settings]', errName(err)); return null })
  if (!shop) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const f = shopFacts(shop, SHOP_DOMAIN)
  const manages = (CAN_MANAGE as readonly string[]).includes(auth.membership.role)
  const [pay, plan] = await Promise.all([
    paymentStatusFor(auth.membership.tenantId).catch(() => null),
    manages ? planLine(auth.membership).catch(() => undefined) : null,
  ])
  const mainHost = f.slug ? await mainHostFor(auth.membership.tenantId, f.slug).catch(() => shopHost(f.slug)) : ''
  const online = !pay ? 'Couldn’t load' : !pay.connected ? 'Not connected' : pay.problem ? 'Needs attention' : !pay.webhookSeenAt ? 'Connected · one step left in Razorpay' : pay.mode === 'test' ? 'Test mode' : 'Live · UPI, cards, netbanking'
  const onlineNeeds = !!pay && (!pay.connected || !!pay.problem || !pay.webhookSeenAt)
  // D1·8: Razorpay fails live payments from an address not registered on the shop's account — the main one must be
  // approved (the merchant's word; checkout offers online payment only on an approved address).
  const names = takesLivePayments(pay) ? await liveNamesFor(auth.membership.tenantId).catch(() => []) : []
  const current = names.find((n) => !n.added)
  const missing: { label: string; section: string }[] = [...missingForLivePayments(f),
    ...(current && !current.razorpayOk ? [{ label: `Add ${shopHost(current.name)} in Razorpay`, section: 'address' }] : [])]
  const policyGaps = POLICY_PAGES.filter(([k]) => missingFacts(renderPolicy(k, f, inr)).length).length

  // Neel § Screens · Settings: each row its current value, the parts joined by " · ".
  const parts = (...p: (string | null | false)[]) => p.filter(Boolean).join(' · ')
  const summary: Record<SectionKey, string> = {
    store: parts(f.shopName, f.logoUrl ? 'logo' : 'no logo yet', !!f.tagline && `“${f.tagline.slice(0, 40)}”`),
    contact: grievanceComplete(f) ? parts(f.supportEmail, f.grievanceName) : f.grievanceName ? 'Grievance officer’s email or phone missing' : 'Grievance officer missing',
    policies: policyGaps ? `${policyGaps} of 5 pages need details` : parts(f.returnKind === 'none' ? 'No returns' : `${f.returnDays}-day returns`, '5 pages'),
    payments: f.codOn ? parts('On', !!f.codMax && `up to ${inr(f.codMax)}`, !!f.codCharge && `fee ${inr(f.codCharge)}`) : 'Off',
    shipping: parts(f.shippingFlat ? inr(f.shippingFlat) : 'Free', !!f.shippingFlat && !!f.freeShippingAbove && `free above ${inr(f.freeShippingAbove)}`, `${f.dispatchDays} ${f.dispatchDays === 1 ? 'day' : 'days'}`),
    business: missing.some((m) => m.section === 'business') ? missing.filter((m) => m.section === 'business').map((m) => m.label).join(' and ') + ' missing' : parts(f.legalName, f.gstin || 'Not registered for GST'),
    invoices: parts(`${f.invoiceSeries} series`, f.slipSize === 'label' ? '4×6 slips' : 'A4 slips', f.docSignatory ? `signed ${f.docSignatory}` : 'no signatory yet'),
  }
  // Shipping costs: whoever seesCosts (owners and admins; a partner before handover). Staff never read them.
  const seen = (CAN_SET_COSTS as readonly string[]).includes(auth.membership.role) ? await shipCostsSeenBy(auth.membership.tenantId, auth.membership.role).catch(() => undefined) : null
  const ship = seen?.visible ? seen.costs : seen === undefined ? undefined : null
  const est = ship === undefined ? null : estimateOf(ship)
  const shipSummary = ship === undefined ? 'Couldn’t load' : est ? `Delivery ${inr(est.delivery)} · return ${inr(est.ret)} · COD fee ${inr(est.codFee)}` : 'Not confirmed'
  const shipNeeds = ship !== undefined && !est
  const sectionNeeds = (k: SectionKey) => missing.some((m) => m.section === k) || (k === 'policies' && policyGaps > 0)
  const role = auth.membership.role
  // Each page this person may open: its value, and whether it has something to fix (the group counts those).
  const rowOf = (k: PageKey): { summary: string; needs: boolean; mono?: boolean } | null => {
    switch (k) {
      case 'web-address': return { summary: mainHost, needs: missing.some((m) => m.section === 'address'), mono: true }
      case 'online-payments': return { summary: online, needs: onlineNeeds }
      case 'shipping-costs': return seen === null || (seen !== undefined && !seen.visible) ? null : { summary: shipSummary, needs: shipNeeds }
      case 'emails': return { summary: 'Order emails in your store’s name', needs: false }
      case 'notifications': return { summary: 'What Frrata emails you', needs: false }
      case 'people': return { summary: 'Who works on this store', needs: false }
      case 'billing': return { summary: plan === 'not_allowed' || plan === undefined && !manages ? '' : plan ? `${plan.name} · ${formatInr(plan.monthlyPrice)} a month` : plan === null ? 'No plan yet' : 'Couldn’t load', needs: false }
      default: return { summary: summary[k], needs: sectionNeeds(k), mono: k === 'business' && !!f.gstin && !f.legalName }
    }
  }
  const groups = groupsFor(role).map(({ group, pages }) => {
    const rows = pages.map((k) => ({ k, r: rowOf(k) })).filter((x): x is { k: PageKey; r: NonNullable<ReturnType<typeof rowOf>> } => x.r !== null)
    return { group, rows, fix: rows.filter((x) => x.r.needs).length }
  }).filter((g) => g.rows.length)
  const asked = groupFor((await searchParams).group)
  // No group asked for: a phone shows the groups; a wide screen opens the first with something to fix, else the first.
  const open = groups.find((g) => g.group.key === asked?.key) ?? groups.find((g) => g.fix) ?? groups[0]

  return (
    <>
      {/* Settings in five groups (owner, 2026-11-15): pick a group, its pages appear. */}
      <div className={asked ? 'max-md:hidden' : undefined}>
        <PageHeader title="Settings" actions={missing.length ? <Badge tone="warn">{missing.length} to fix for live payments</Badge> : <Badge tone="ok">Ready for live payments</Badge>} />
      </div>
      <div className="mt-4 max-w-240 space-y-4">
        {missing.length ? (
          <div className={asked ? 'max-md:hidden' : undefined}>
            <Banner tone="warn" title="Before live payments">
              <span className="inline-flex flex-wrap gap-x-3">{missing.map((m) => <Link key={m.label} href={`/console/settings/${m.section === 'address' ? 'web-address' : m.section}`} className="font-medium text-link hover:underline">{m.label}</Link>)}</span>
            </Banner>
          </div>
        ) : null}
        <div className="grid items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Settings groups" className={asked ? 'max-md:hidden' : undefined}>
            <ul className="flex flex-col overflow-hidden rounded-lg border border-border md:gap-1 md:overflow-visible md:rounded-none md:border-0">
              {groups.map(({ group, fix }) => {
                const current = open?.group.key === group.key
                return (
                  <li key={group.key} className="border-t border-line-soft first:border-t-0 md:border-0">
                    <Link href={`/console/settings?group=${group.key}`} aria-current={current ? 'true' : undefined}
                      className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-fast md:rounded-mid md:border md:px-3.5 ${current ? 'md:border-transparent md:bg-select' : 'md:border-transparent hover:bg-side'}`}>
                      <span className="flex min-w-0 flex-col gap-0.5"><span className="font-medium">{group.name}</span><span className="text-label text-muted-foreground md:truncate">{group.sub}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        {fix ? <Badge tone="warn" aria-label={`${fix} to fix`}>{fix}</Badge> : null}
                        <Icon name="chevron" className="size-4 text-muted-foreground md:hidden" />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          {open ? (
            <section aria-labelledby="settings-group" className={`flex flex-col gap-2 ${asked ? '' : 'max-md:hidden'}`}>
              <span className="md:hidden"><BackLink href="/console/settings" label="Settings" /></span>
              <h2 id="settings-group" className="text-title font-semibold md:text-section">{open.group.name}</h2>
              <Section as="nav" flush ariaLabel={open.group.name}>
                {open.rows.map(({ k, r }) => <Row key={k} href={pageHref(k)} title={pageTitle(k)} summary={r.summary} needs={r.needs} mono={r.mono} />)}
              </Section>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}
