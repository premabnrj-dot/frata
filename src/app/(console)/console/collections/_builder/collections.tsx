import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import type { BuilderActor } from '@/lib/db/actor'
import { builderCollections } from '@/lib/queries/builder'
import { errName } from '@/lib/log'
import { unreadable } from '@/app/(console)/console/_builder/unreadable'
import { CollectionsTable } from '../_components/collections-table'

/** A Builder's Collections (T1c; approved mockup screen 9): view only, as frata_builder; each opens in the preview. */
export async function BuilderCollections({ actor }: { actor: BuilderActor }) {
  const got = await builderCollections(actor).then((rows) => ({ rows })).catch((err: unknown) => { console.error('[builder collections]', errName(err)); return unreadable(err) })
  if ('panel' in got) return got.panel
  const rows = got.rows
  return (
    <>
      <PageHeader title="Collections" />
      {!rows.length ? <Panel title="No collections yet" /> : <CollectionsTable rows={rows} href={(h) => `/console/preview/collections/${h}`} external />}
    </>
  )
}
