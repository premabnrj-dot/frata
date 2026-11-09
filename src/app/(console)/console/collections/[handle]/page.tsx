import { notFound } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import type { Rule } from '@/domains/catalogue/collection-rules'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { collectionForEdit } from '@/lib/queries/catalogue'
import { CollectionEditor } from '../_components/collection-editor'
import { fromRules } from '../_components/rule-rows'
import { categoryNames, editorData } from '../_components/data'
import { ShareSheet } from '../../_components/share-sheet'
import { shareFor } from '@/lib/seo/share'

export const metadata = { title: 'Collection' }

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const handle = decodeURIComponent((await params).handle).toLowerCase()
  if (!/^[a-z0-9-]{1,80}$/.test(handle)) notFound()
  const [c, data] = await Promise.all([collectionForEdit(auth.membership.tenantId, handle), editorData(auth.membership.tenantId)]).catch(() => [undefined, null] as const)
  if (c === undefined || !data) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!c) notFound()
  const rules = c.rules as Rule[]
  const share = await shareFor(auth.membership.tenantId, { kind: 'collection', id: c.id }).catch(() => null)
  return <CollectionEditor key={c.id + c.updatedAt.toISOString()} initial={{ id: c.id, title: c.title, handle: c.handle, description: c.description, seoTitle: c.seoTitle, seoDescription: c.seoDescription, kind: c.kind as 'manual', matchAll: c.matchAll === 1, rules: fromRules(rules, categoryNames(rules)), sort: c.sort, productIds: c.productIds }} {...data} share={share ? <ShareSheet share={share} target={{ kind: 'collection', id: c.id }} /> : null} />
}
