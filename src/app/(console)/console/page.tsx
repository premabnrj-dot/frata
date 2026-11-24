import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { redirect } from 'next/navigation'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { todayLongIN } from '@/lib/format-date'
import { requireCapability } from '@/lib/auth/require-capability'
import { setupFor } from '@/lib/queries/settings'
import { todaySummary } from '@/lib/queries/today'
import { SetupCard } from './_components/setup/setup-card'
import { OpenMoment } from './_components/open-moment'
import { Today } from './_components/today'
import { ShareSheet } from './_components/share-sheet'
import { shareFor } from '@/lib/seo/share'
import { shopLink, whatsappShare } from '@/domains/analytics/link'

// =============================================================================
// FILE: src/app/(console)/console/page.tsx — Home
//
// Before the store opens, the setup card (plan 2026-11-23-o2a-setup-card O2a·7, mockup § 2): the next step, then the
// four steps. Once it is open, "Today" (docs/specs/2026-11-07-ux-today.md): what waits, the next order, the week.
// OpenMoment wraps both, at the same place in the tree, so the moment drawn when the store opens outlives the card it
// was opened from. One requireMember; every read takes it.
// =============================================================================

/** Home shares the layout's segment, where Next does not apply the layout's title template: the full title here. */
export async function generateMetadata() {
  const auth = await requireMember(ANY_MEMBER)
  return { title: { absolute: auth.ok ? `Home · ${auth.membership.tenantName}` : 'Home · Frrata' } }
}

export default async function ConsoleHome() {
  // A partner's Builder has no Home: its console opens on Products (T1c, approved mockup screen 7).
  const cap = await requireCapability('console.open')
  if (cap.ok && cap.kind === 'builder') redirect('/console/products')
  // The accountant's console is GST (GST plan phase 3): Home is the shop's day, not theirs.
  const who = await requireMember(['accountant'])
  if (who.ok) redirect('/console/apps/gst')
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const now = new Date()
  const setup = await setupFor(tenantId).catch((err) => { console.error('[console home]', err instanceof Error ? err.name : 'error'); return null })
  if (!setup) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  // A failed summary is a page of "Couldn't count", never of zeros. The summary and the share card do not wait for each
  // other (speed review 2026-11-13); a failed share read only hides the button.
  const [s, share] = setup.open ? await Promise.all([
    todaySummary(tenantId, now).catch((err) => { console.error('[today]', err instanceof Error ? err.name : 'error'); return null }),
    shareFor(tenantId, { kind: 'shop' }, now).catch(() => null),
  ]) : [null, null]
  // Neel § Screens · Home: "Today" and the day; Store open (a link to Setup, where the store closes for now) and Share
  // store at the right. The store's name and address live in the sidebar now.
  // Before opening: "Home" with Opening soon beside it, no meta line (mockup § 2).
  const actions = setup.open ? <>
    <Link href="/console/setup" aria-label="Store open. Go to setup to close it." className="inline-flex min-h-6 items-center rounded-full"><Badge tone="ok">Store open</Badge></Link>
    {share ? <ShareSheet share={share} target={{ kind: 'shop' }} label="Share store" /> : null}
  </> : undefined
  // The open moment's Share on WhatsApp (pure: no read). While the store has just opened in this session, Home is the
  // card's open state under "Home" and Open (O2a·8); drawn here once it is open, shown by OpenMoment only then.
  const whatsapp = whatsappShare(setup.name, shopLink(`https://${setup.address}`, '/', { preset: 'share_whatsapp' }))
  const role = auth.membership.role
  const openView = setup.open ? <><PageHeader title="Home" badges={<Badge tone="ok">Open</Badge>} /><SetupCard setup={setup} role={role} tenantId={tenantId} hideable /></> : undefined
  return (
    <OpenMoment key={tenantId} name={setup.name} address={setup.address} whatsapp={whatsapp} open={openView}
      header={<PageHeader title={setup.open ? 'Today' : 'Home'} actions={actions} badges={setup.open ? undefined : <Badge tone="warn">Opening soon</Badge>}
        meta={setup.open ? todayLongIN(now) : undefined} />}>
      {setup.open ? <Today s={s} setup={setup} now={now} /> : <SetupCard setup={setup} role={role} tenantId={tenantId} />}
    </OpenMoment>
  )
}
