import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { connectionState, needsFor } from '@/domains/communication/health'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { isMessagesConfigured } from '@/lib/env'
import { shopConnection } from '@/lib/modules/communication/connection'
import { GRAPH_VERSION } from '@/lib/modules/communication/graph'
import { META_APP_ID, WA_CONFIG_ID, isWhatsAppSignupConfigured } from '@/lib/public-env'
import { shopModules } from '@/lib/queries/modules'
import { dateTimeIN } from '@/lib/format-date'
import { ConnectChoices } from './connect'
import { NumberHealth } from './health'

export const metadata = { title: 'Messages' }

export default async function MessagesSetupPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const now = new Date()
  const { access } = await shopModules(tenantId, now.toISOString())
  const back = { href: '/console/apps', label: 'Apps' }
  if (!access.communication.usable) {
    return (
      <>
        <PageHeader title="Messages" back={back} />
        <Panel title={access.communication.why === 'paused' ? 'Messages is paused by Frrata. We’re on it.' : 'Turn on Messages first'}
          action={<Link href="/console/apps" className={button({ variant: 'secondary' })}>Go to Apps</Link>} />
      </>
    )
  }
  const c = await shopConnection(tenantId)
  const canManage = (CAN_MANAGE as readonly string[]).includes(auth.membership.role) && !auth.membership.supportSessionId
  if (!c) {
    const ready = isMessagesConfigured() && isWhatsAppSignupConfigured()
    return (
      <>
        <PageHeader title="Connect WhatsApp" back={back} meta="Your own business number. Meta bills messages to you." />
        <ConnectChoices ready={ready} canManage={canManage} appId={META_APP_ID} configId={WA_CONFIG_ID} graphVersion={GRAPH_VERSION} />
      </>
    )
  }
  const needs = needsFor(c.health, now)
  const state = connectionState(needs)
  return (
    <>
      <PageHeader title="Messages" back={back} badges={state === 'connected' ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Needs attention</Badge>} />
      <NumberHealth canManage={canManage} needs={needs} c={{
        displayPhone: c.displayPhone, verifiedName: c.verifiedName, coexistence: c.coexistence, quality: c.quality, limitTier: c.limitTier,
        historySync: c.historySyncAt !== null, checked: c.checkedAt ? dateTimeIN(c.checkedAt) : null,
      }} />
    </>
  )
}
