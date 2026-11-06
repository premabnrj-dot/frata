import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'

export default async function ConsoleHome() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  return (
    <>
      <PageHeader title="Home" />
      <Panel title="Nothing needs you right now">
        Orders to confirm and failed deliveries to act on will appear here first.
      </Panel>
    </>
  )
}
