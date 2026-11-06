import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'

export default function ConsoleHome() {
  return (
    <>
      <PageHeader title="Home" />
      <Panel title="Nothing needs you right now">
        Orders to confirm and failed deliveries to act on will appear here first.
      </Panel>
    </>
  )
}
