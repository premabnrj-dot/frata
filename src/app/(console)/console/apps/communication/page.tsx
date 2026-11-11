import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { connectionState, needsFor } from '@/domains/communication/health'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { canManageWhatsApp } from '@/domains/communication/roles'
import { isMessagesConfigured } from '@/lib/env'
import { shopConnection } from '@/lib/modules/communication/connection'
import { GRAPH_VERSION } from '@/lib/modules/communication/graph'
import { META_APP_ID, WA_CONFIG_ID, isWhatsAppSignupConfigured } from '@/lib/public-env'
import { appsPage } from '@/lib/queries/modules'
import { AppAbout } from '../_components/app-about'
import { aboutProps, mayTurnOff } from '../_components/about-data'
import { AppHome } from '../_components/app-home'
import { dateTimeIN } from '@/lib/format-date'
import { ConnectChoices } from './connect'
import { DisconnectOnly, NumberHealth } from './health'

export const metadata = { title: 'Messages' }

export default async function MessagesSetupPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const now = new Date()
  // One read for the state, the price and the about page (A1 impact review: never the facts twice).
  const [d, c] = await Promise.all([
    appsPage(tenantId, auth.userId, now.toISOString()).catch((err) => { console.error('[messages apps]', err instanceof Error ? err.name : 'error'); return null }),
    shopConnection(tenantId),
  ])
  if (!d) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const canManage = canManageWhatsApp(auth.membership)
  const about = aboutProps('communication', d, now, mayTurnOff(auth.membership), auth.membership.tenantName)
  if (!d.access.communication.usable) {
    // Off or paused, the app's page (Apps gallery A1); a connected number stays connected to Meta and can still be
    // disconnected here (impact review).
    const paused = d.access.communication.why === 'paused'
    return <AppAbout {...about}
      notice={paused || c ? <p role="status" className="mb-4 rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{paused ? 'Messages is paused by Frrata. We’re on it.' : null}{paused && c ? ' ' : null}{c ? `${c.displayPhone} is still connected to Meta. Chats keep arriving and wait here.` : null}</p> : undefined}
      after={c && canManage ? <DisconnectOnly displayPhone={c.displayPhone} /> : undefined} />
  }
  // Its home (Apps A2): Overview is the number's health, or connecting one; Usage and billing; Turn off at the foot.
  const tab = (await searchParams).tab === 'billing' ? 'billing' : 'overview'
  const needs = c ? needsFor(c.health, now) : null
  const badge = c ? (connectionState(needs!) === 'connected' ? <Badge tone="ok">Connected</Badge> : <Badge tone="warn">Needs attention</Badge>) : <Badge tone="neutral">No number yet</Badge>
  let body: React.ReactNode = null
  if (tab === 'overview') {
    if (!c) {
      const ready = isMessagesConfigured() && isWhatsAppSignupConfigured()
      body = (
        <section aria-labelledby="connect" className="space-y-3">
          <h2 id="connect" className="text-section font-semibold">Connect WhatsApp</h2>
          <ConnectChoices ready={ready} canManage={canManage} appId={META_APP_ID} configId={WA_CONFIG_ID} graphVersion={GRAPH_VERSION} />
        </section>
      )
    } else {
      body = <NumberHealth canManage={canManage} needs={needs!} c={{
        displayPhone: c.displayPhone, verifiedName: c.verifiedName, coexistence: c.coexistence, quality: c.quality, limitTier: c.limitTier,
        historySync: c.historySyncAt !== null, checked: c.checkedAt ? dateTimeIN(c.checkedAt) : null,
      }} />
    }
  }
  return (
    <AppHome k="communication" tab={tab} offer={about.offer} worksWith={about.worksWith} billing canTurnOff={mayTurnOff(auth.membership)} badge={badge}
      meta={c ? undefined : 'Your own business number. Meta bills messages to you.'}>{body}</AppHome>
  )
}
