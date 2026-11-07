import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { CollectionEditor } from '../_components/collection-editor'
import { editorData } from '../_components/data'

export const metadata = { title: 'New collection' }

export default async function NewCollectionPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const data = await editorData(auth.membership.tenantId).catch(() => null)
  if (!data) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const kind = (await searchParams).kind === 'auto' ? 'auto' : 'manual'
  return <CollectionEditor initial={{ id: null, title: '', handle: '', description: '', kind, matchAll: true, rules: kind === 'auto' ? [{ field: 'category', value: '' }] : [], sort: kind === 'auto' ? 'newest' : 'manual', productIds: [] }} {...data} />
}
