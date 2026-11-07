import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { PictoTile } from '@/components/brand/illustrations'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { clientStage, shareWindow, STAGE_LABEL, type ClientStage } from '@/domains/partners/stage'
import { PARTNER_TERMS } from '@/domains/partners/terms'
import { switchStoreAction } from '@/app/choose/actions'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerClients, type ClientRow } from '@/lib/db/partners'
import { dayIN, monthYearIN } from '@/lib/format-date'
import { SHOP_DOMAIN } from '@/lib/public-env'

export const metadata = { title: 'Clients' }

const TONE: Record<ClientStage, 'neutral' | 'warn' | 'ok'> = { building: 'neutral', invited: 'warn', with_owner: 'neutral', open: 'ok', ended: 'neutral' }
const VIEWS = [['all', 'All'], ['building', 'Building'], ['invited', 'Invite sent'], ['with_owner', 'With the owner'], ['open', 'Open'], ['ended', 'Removed']] as const

function Share({ c }: { c: ClientRow }) {
  const w = shareWindow(c, c.firstOpenedAt, c.removedAt)
  if (w === 'not_started') return <span className="text-muted-foreground">{c.removedAt ? '—' : 'Starts at opening'}</span>
  return <span><span className="font-mono">{PARTNER_TERMS.shareBps / 100}%</span> until <span className="font-mono">{c.removedAt ? dayIN(w.endsAt) : monthYearIN(w.endsAt)}</span></span>
}

/** Partner workspace › Clients (approved mockup screens 5, 5b, 5c). Frata's facts per store, never its orders. */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const rows = await partnerClients(auth.userId).catch((err) => { console.error('[clients]', err instanceof Error ? err.name : err); return null })
  if (!rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const newStore = <Link href="/partner/new" className={button()}>New client store</Link>
  if (!rows.length) {
    return (
      <>
        <PageHeader title="Clients" />
        <Section className="max-w-xl" ariaLabel="First client store">
          <PictoTile name="build" tone="haldi" />
          <div>
            <h2 className="text-section font-semibold">Make your first client store</h2>
            <p className="mt-1 text-sm text-muted-foreground">Build it, then hand it to the owner.</p>
          </div>
          {newStore}
        </Section>
      </>
    )
  }
  const staged = rows.map((c) => ({ c, stage: clientStage({ removedAt: c.removedAt, openInviteExpiresAt: c.inviteExpiresAt, hasOwner: !!c.ownerEmail, firstOpenedAt: c.firstOpenedAt }, now) }))
  const { view = 'all' } = await searchParams
  const current = VIEWS.some(([k]) => k === view) ? view : 'all'
  const shown = current === 'all' ? staged : staged.filter((s) => s.stage === current)
  const tabs = VIEWS.map(([k, label]) => ({ href: k === 'all' ? '/partner' : `/partner?view=${k}`, label, count: k === 'all' ? staged.length : staged.filter((s) => s.stage === k).length, current: k === current }))
    .filter((t) => t.count > 0 || t.current || t.href === '/partner')
  return (
    <>
      <PageHeader title="Clients" actions={newStore} />
      <ViewTabs label="Client views" tabs={tabs} />
      {shown.length === 0 ? <Panel title="No store here yet" /> : (
        <Section flush ariaLabel="Client stores"><ul className="divide-y divide-border">
          <li aria-hidden="true" className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_6rem_minmax(0,1fr)_7rem] gap-3 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>Store</span><span>Stage</span><span>Owner</span><span>Plan</span><span className="inline-flex items-center">Your share<InfoTip about="your share">{PARTNER_TERMS.shareBps / 100}% of what Frata collects from the store, ex GST, for {PARTNER_TERMS.shareMonths} months from its first opening, while you are its partner. Removed: {PARTNER_TERMS.noticeDays} more days. Paid when Frata billing starts.</InfoTip></span><span />
          </li>
          {shown.map(({ c, stage }) => (
            <li key={c.tenantId} className={`grid gap-x-3 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_6rem_minmax(0,1fr)_7rem] lg:items-center ${stage === 'ended' ? 'text-muted-foreground' : ''}`}>
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                {c.slug && <p className="truncate font-mono text-xs text-muted-foreground">{c.slug}.{SHOP_DOMAIN}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                <span className="text-xs text-muted-foreground lg:hidden">{c.removedAt ? dayIN(c.removedAt) : null}</span>
              </div>
              <div className="min-w-0 truncate font-mono text-xs">
                {stage === 'invited' ? c.inviteEmail : c.ownerEmail ?? (stage === 'ended' ? '' : <span className="font-sans text-muted-foreground">Not invited</span>)}
              </div>
              <div>{c.planName ?? <span className="text-muted-foreground">—</span>}</div>
              <div><Share c={c} /></div>
              <div className="lg:text-right">
                {stage !== 'ended' && (
                  <form action={switchStoreAction}>
                    <input type="hidden" name="tenantId" value={c.tenantId} />
                    <button type="submit" className={button({ variant: 'secondary' })}>Open store</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul></Section>
      )}
    </>
  )
}
