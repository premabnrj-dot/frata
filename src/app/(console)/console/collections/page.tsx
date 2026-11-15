import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { CollectionsTable } from './_components/collections-table'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { requireCapability } from '@/lib/auth/require-capability'
import { BuilderCollections } from './_builder/collections'
import { listCollections } from '@/lib/queries/catalogue'

export const metadata = { title: 'Collections' }

export default async function CollectionsPage() {
  // catalogue.read (T1c): a Builder gets the list view only, as frata_builder, in its own file; each write still asks
  // asMember(ANY_MEMBER) itself.
  const cap = await requireCapability('catalogue.read')
  if (!cap.ok) return <Panel title={cap.message} />
  if (cap.kind === 'builder') return <BuilderCollections actor={cap.actor} />
  const auth = cap.auth
  const rows = await listCollections(auth.membership.tenantId).catch((err) => { console.error('[collections]', err instanceof Error ? err.name : err); return null })
  if (!rows) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <><Link href="/console/collections/new?kind=auto" className={button({ variant: 'secondary' })}>Rule-based</Link><Link href="/console/collections/new" className={button()}>Add collection</Link></>
  return (
    <>
      <PageHeader title="Collections" back={{ href: '/console/products', label: 'Products' }} actions={add} />
      {!rows.length ? (
        <Panel title="No collections yet">Group products for your store’s menus. Pick them by hand, or let rules add new products.</Panel>
      ) : (
        <CollectionsTable rows={rows} href={(h) => `/console/collections/${h}`} />
      )}
    </>
  )
}
