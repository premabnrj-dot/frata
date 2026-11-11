import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { isModuleKey, MODULES } from '@/domains/modules/registry'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { appsPage } from '@/lib/queries/modules'
import { AppAbout } from '../_components/app-about'
import { aboutProps, mayTurnOff } from '../_components/about-data'

// An app's page (Apps gallery A1). Apps with a home of their own (communication, ekcode, gst) are static folders that
// render the same AppAbout until they are on; this route serves the rest, and refuses keys that aren't apps.
export async function generateMetadata({ params }: { params: Promise<{ app: string }> }): Promise<Metadata> {
  const { app } = await params
  return { title: isModuleKey(app) ? MODULES[app].name : 'Apps' }
}

export default async function AppPage({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params
  if (!isModuleKey(app)) notFound()
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const d = await appsPage(auth.membership.tenantId, auth.userId, now.toISOString())
    .catch((err) => { console.error('[app]', err instanceof Error ? err.name : 'error'); return null })
  if (!d) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  // An app without a home of its own may be on here: its Turn off follows setModuleAction's rule (never a support visit).
  return <AppAbout {...aboutProps(app, d, now, mayTurnOff(auth.membership), auth.membership.tenantName)} />
}
