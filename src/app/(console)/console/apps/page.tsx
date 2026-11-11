import { PageHeader } from '@/components/layout/page-header'
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
  const d = await appsPage(auth.membership.tenantId, auth.userId, now.toISOString())
    .catch((err) => { console.error('[apps]', err instanceof Error ? err.name : 'error'); return null })
  if (!d) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const cards: AppCard[] = MODULE_KEYS.map((k) => {
    const def = MODULES[k], offer = offerOf(k, d, now)
    return { key: k, name: def.name, job: def.job, group: def.group, href: `/console/apps/${k}`, footer: offer.footer, locked: offer.locked,
      state: offer.state, filter: offer.filter, mine: d.access[k].usable }
  })
  return (
    <>
      <PageHeader title="Apps" />
      <AppsGallery cards={cards} groups={GROUPS.map(([key, label]) => ({ key, label }))} />
    </>
  )
}
