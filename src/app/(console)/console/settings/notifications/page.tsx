import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CONSOLE_ROLES } from '@/domains/tenancy/roles'
import { noticePrefsFor } from '@/lib/queries/notices'
import { Prefs, type PrefRow } from './prefs'

export const metadata = { title: 'Your notifications' }

/** Settings › Your notifications (mockup v2 screen 8): every notice lands in Notices; email per kind. */
export default async function NotificationsPage() {
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok) return <Panel title={auth.message} />
  const prefs = await noticePrefsFor(auth.membership.tenantId, auth.userId).catch(() => null)
  if (!prefs) return <><PageHeader title="Your notifications" back={{ href: '/console/settings', label: 'Settings' }} /><Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel></>
  const ownerAdmin = auth.membership.role === 'owner' || auth.membership.role === 'admin'
  const rows: PrefRow[] = [
    ...(ownerAdmin ? [{ type: 'required', label: 'Billing · security · Frrata acted on your shop', email: 'always' as const }] : []),
    { type: 'needs_you', label: 'Payment keys · WhatsApp · shipping costs need you', email: prefs.needs_you },
    { type: 'product_update', label: 'Frrata updates (once a month at most)', email: prefs.product_update },
  ]
  return (
    <>
      <PageHeader title="Your notifications" back={{ href: '/console/settings', label: 'Settings' }} />
      <Section flush ariaLabel="Email for each kind of notice">
        <Prefs rows={rows} readOnly={!!auth.membership.supportSessionId} />
      </Section>
    </>
  )
}
