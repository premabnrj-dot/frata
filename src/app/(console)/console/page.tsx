import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { redirect } from 'next/navigation'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { todayLongIN } from '@/lib/format-date'
import { setupFor } from '@/lib/queries/settings'
import { todaySummary } from '@/lib/queries/today'
import { Checklist } from './_components/checklist'
import { OpenMoment } from './_components/open-moment'
import { Today } from './_components/today'
import { ShareSheet } from './_components/share-sheet'
import { shareFor } from '@/lib/seo/share'

// =============================================================================
// FILE: src/app/(console)/console/page.tsx — Home
//
// Before the shop opens, the setup checklist. Once it is open, "Today" (docs/specs/2026-11-07-ux-today.md):
// what waits, the next order, the week. OpenMoment wraps both, at the same place in the tree, so the check
// drawn when the shop opens outlives the checklist it was opened from. One requireMember; every read takes it.
// =============================================================================

/** Home shares the layout's segment, where Next does not apply the layout's title template: the full title here. */
export async function generateMetadata() {
  const auth = await requireMember(ANY_MEMBER)
  return { title: { absolute: auth.ok ? `Home · ${auth.membership.tenantName}` : 'Home · Frrata' } }
}

export default async function ConsoleHome() {
  // The accountant's console is GST (GST plan phase 3): Home is the shop's day, not theirs.
  const who = await requireMember(['accountant'])
  if (who.ok) redirect('/console/apps/gst')
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId, canManage = auth.membership.role !== 'staff'
  const now = new Date()
  const setup = await setupFor(tenantId).catch((err) => { console.error('[console home]', err instanceof Error ? err.name : 'error'); return null })
  if (!setup) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  // A failed summary is a page of "Couldn't count", never of zeros.
  const s = setup.open ? await todaySummary(tenantId, now).catch((err) => { console.error('[today]', err instanceof Error ? err.name : 'error'); return null }) : null

  // Share the shop (search and sharing S1·7); a failed read only hides the button.
  const share = setup.open ? await shareFor(tenantId, { kind: 'shop' }, now).catch(() => null) : null
  return (
    <OpenMoment key={tenantId} address={setup.address} header={<PageHeader title={setup.open ? 'Today' : 'Home'}
      meta={<>{setup.name} · <span className="font-mono">{setup.address}</span>{setup.open ? ` · ${todayLongIN(now)}` : ''}</>} />}>
      {setup.open ? <Today s={s} setup={setup} now={now} share={share ? <ShareSheet share={share} target={{ kind: 'shop' }} /> : null} /> : <Checklist setup={setup} canManage={canManage} />}
    </OpenMoment>
  )
}
