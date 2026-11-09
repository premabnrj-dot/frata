import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { seoFixes } from '@/domains/seo/fixes'
import { homeSeo } from '@/domains/seo/defaults'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { homeSeoFacts, seoFixFacts } from '@/lib/queries/seo-fixes'
import { shareFor } from '@/lib/seo/share'
import { ShareSheet } from '../_components/share-sheet'
import { HomeOnGoogle } from './_components/home-on-google'

export const metadata = { title: 'Search and sharing' }

/** Search and sharing (S·3, mockup board "Search"): the shop's fixes, then Home on Google. Google's own sections wait for S·4. */
export default async function SearchPage() {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const [facts, own, shop, share] = await Promise.all([seoFixFacts(tenantId), homeSeoFacts(tenantId), shopSettingsFor(tenantId), shareFor(tenantId, { kind: 'shop' }).catch(() => null)])
    .catch(() => [null, null, null, null] as const)
  if (!facts || !own || !shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const fixes = seoFixes(facts)
  const defaults = homeSeo({ ...shop, seoTitle: '', seoDescription: '' })
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Search and sharing" actions={share ? <ShareSheet share={share} target={{ kind: 'shop' }} /> : null} />
      <Section id="fixes" flush ariaLabel="To fix">
        <h2 className="border-b border-border px-4 py-3 text-section font-semibold md:px-5">{fixes.length ? `To fix · ${fixes.length}` : 'Nothing to fix'}</h2>
        {fixes.length > 0 && (
          <ul className="divide-y divide-border">
            {fixes.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm md:px-5">
                <span>{f.text}</span>
                <Link href={f.href} className="inline-flex min-h-6 shrink-0 items-center font-medium underline">{f.action}</Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <HomeOnGoogle initial={own} defaults={defaults} address={shop.host} />
    </div>
  )
}
