import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { FeaturedCard } from '@/components/modules/featured-card'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { paise } from '@/domains/money/paise'
import { managesInPerson } from '@/domains/tenancy/roles'
import { formatInr } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import { Panel } from '@/components/ui/panel'
import { GROUPS, MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { appsPage } from '@/lib/queries/modules'
import { offerOf } from './_components/about-data'
import { AppsGallery, type AppCard } from './_components/gallery'

export const metadata = { title: 'Apps' }

/** Console › Apps (approved mockup 2026-11-11): your apps, then every app as a card by the merchant's job. */
export default async function AppsPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  // The featured card reads the shop's bill: owners and admins only, never a support visit (A2; featuredBillWith refuses too).
  const mayBill = managesInPerson(auth.membership)
  const d = await appsPage(auth.membership.tenantId, auth.userId, now.toISOString(), mayBill ? auth.membership : undefined)
    .catch((err) => { console.error('[apps]', err instanceof Error ? err.name : 'error'); return null })
  if (!d) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const cards: AppCard[] = MODULE_KEYS.map((k) => {
    const def = MODULES[k], offer = offerOf(k, d, now)
    return { key: k, name: def.name, job: def.job, group: def.group, href: `/console/apps/${k}`, footer: offer.footer, locked: offer.locked,
      state: offer.state, filter: offer.filter, mine: d.access[k].usable || d.access[k].why === 'needs' }
  })
  return (
    <>
      <PageHeader title="Apps" />
      <AppsGallery cards={cards} groups={GROUPS.map(([key, label]) => ({ key, label }))} featured={d.featured ? <Featured n={d.featured} /> : undefined} />
    </>
  )
}

/** The featured card (A2): the cheapest plan on the shop's last issued invoice, in its own rupees (cheapestPlan). */
type FeaturedNudge = NonNullable<Awaited<ReturnType<typeof appsPage>>['featured']>
function Featured({ n }: { n: FeaturedNudge }) {
  const on = dayMonthIN(n.periodStart)
  return (
    <FeaturedCard id={n.invoiceId} action={<Link href="/console/settings/billing?from=featured" prefetch={false} className={button()}>See {n.planName}</Link>}>
      <Badge tone="warn">For your shop</Badge>
      <h2 className="text-section font-semibold">On {n.planName} your {on} invoice would have been {formatInr(paise(n.saving))} less</h2>
      <p className="font-mono text-sm text-muted-foreground">{formatInr(paise(n.billed))} on Launch · {formatInr(paise(n.would))} on {n.planName} · both + 18% GST</p>
    </FeaturedCard>
  )
}
