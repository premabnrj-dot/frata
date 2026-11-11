import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { connectionState, needsFor } from '@/domains/communication/health'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { canManageWhatsApp } from '@/domains/communication/roles'
import { isMessagesConfigured } from '@/lib/env'
import { shopConnection } from '@/lib/modules/communication/connection'
import { GRAPH_VERSION } from '@/lib/modules/communication/graph'
import { META_APP_ID, WA_CONFIG_ID, isWhatsAppSignupConfigured } from '@/lib/public-env'
import { appsPage, shopModules } from '@/lib/queries/modules'
import { AppAbout } from '../_components/app-about'
import { aboutProps } from '../_components/about-data'
import { dateTimeIN } from '@/lib/format-date'
import { ConnectChoices } from './connect'
import { DisconnectOnly, NumberHealth } from './health'

export const metadata = { title: 'Messages' }

export default async function MessagesSetupPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const now = new Date()
  const { access } = await shopModules(tenantId, now.toISOString())
  const back = { href: '/console/apps', label: 'Apps' }
  const c = await shopConnection(tenantId)
  const canManage = canManageWhatsApp(auth.membership)
  if (!access.communication.usable) {
    // Off or paused, the app's page (Apps gallery A1); a connected number stays connected to Meta and can still be
    // disconnected here (impact review).
    const d = await appsPage(tenantId, auth.userId, now.toISOString())
    const paused = access.communication.why === 'paused'
    return <AppAbout {...aboutProps('communication', d, now, (CAN_MANAGE as readonly string[]).includes(auth.membership.role), auth.membership.tenantName)}
      notice={paused || c ? <p role="status" className="mb-4 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{paused ? 'Messages is paused by Frrata. We’re on it.' : null}{paused && c ? ' ' : null}{c ? `${c.displayPhone} is still connected to Meta. Chats keep arriving and wait here.` : null}</p> : undefined}
      after={c && canManage ? <DisconnectOnly displayPhone={c.displayPhone} /> : undefined} />
  }
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
