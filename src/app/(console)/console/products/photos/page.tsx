import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { isBlobConfigured } from '@/lib/env'
import { photoTargets } from '@/lib/queries/photos'
import { PhotoMatcher } from './_components/photo-matcher'

export const metadata = { title: 'Add photos' }

// Products › Add photos (plan 2026-11-12-product-import PI·2 · 8; mockup view "Photos"), from Products and from an
// import's Done step (?from=import: the way back is the import). Any member adds photos, as any member edits products.
// This page reads the shop's products to match against; the photos are matched, resized and uploaded in the browser.
export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const back = (await searchParams).from === 'import' ? { href: '/console/products/import', label: 'Import' } : { href: '/console/products', label: 'Products' }
  if (!isBlobConfigured()) return <><PageHeader title="Add photos" back={back} /><Panel title="Photo storage is not connected">Photos can be added once Frrata connects it on this deployment.</Panel></>
  const targets = await photoTargets(auth.membership.tenantId).catch((err) => { console.error('[photos page]', err instanceof Error ? err.name : 'error'); return null })
  if (!targets) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!targets.length) {
    return (
      <>
        <PageHeader title="Add photos" back={back} />
        <Panel title="No products yet" action={<span className="flex flex-wrap justify-center gap-2"><Link href="/console/products/import" className={button({ variant: 'secondary' })}>Import</Link><Link href="/console/products/new" className={button()}>Add product</Link></span>}>
          Photos are matched to your products by their file names.
        </Panel>
      </>
    )
  }
  return <PhotoMatcher tenantId={auth.membership.tenantId} targets={targets} back={back} />
}
