import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { PictoTile } from '@/components/brand/illustrations'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { memberState, partnerCan, PARTNER_ROLE_LABEL } from '@/domains/partners/team'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerClients, partnerTeam } from '@/lib/db/partners'
import { dayIN } from '@/lib/format-date'
import { InviteButton, RemovePerson, StoreToggles } from './team-parts'

export const metadata = { title: 'Team' }

/**
 * Partner workspace › Team (T1a; approved Studio mockup, Team). The owner invites Leads, gives each the stores they work
 * on, and removes them. Leads don't see this page; every write is re-checked in its definer.
 */
export default async function TeamPage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  if (!partnerCan(auth.partner.memberRole, 'manageTeam')) return <Panel title="Only the partner’s owner manages the team" />
  const now = new Date()
  const [team, clients] = await Promise.all([
    partnerTeam(auth.userId).catch((err) => { console.error('[team]', err instanceof Error ? err.name : err); return null }),
    partnerClients(auth.userId).catch(() => null),
  ])
  if (!team || !clients) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const stores = clients.filter((c) => !c.removedAt).map((c) => ({ tenantId: c.tenantId, name: c.name }))
  const people = team
  return (
    <>
      <PageHeader title="Team" actions={<InviteButton stores={stores} />} />
      {people.length <= 1 && (
        <Section className="max-w-xl" ariaLabel="Your first teammate">
          <PictoTile name="clients" tone="indigo" />
          <div>
            <h2 className="text-section font-semibold">Bring in your team</h2>
            <p className="mt-1 text-sm text-muted-foreground">Leads build the stores you give them.</p>
          </div>
        </Section>
      )}
      <Section flush ariaLabel="People"><ul data-list className="divide-y divide-border">
        {people.map((p) => {
          const state = memberState(p, now)
          const name = p.isYou ? 'You' : p.email
          return (
            <li key={p.memberId} className="grid gap-x-3 gap-y-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="truncate">{name}</span>
                  <Badge tone={p.role === 'owner' ? 'info' : 'neutral'}>{PARTNER_ROLE_LABEL[p.role]}</Badge>
                  {state === 'invited' && <Badge tone="warn">Invited</Badge>}
                  {state === 'expired' && <Badge tone="neutral">Invite ended</Badge>}
                </p>
                {!p.isYou && <p className="truncate font-num text-xs text-muted-foreground">{state === 'active' ? `Since ${dayIN(p.acceptedAt!)}` : p.inviteExpiresAt ? `Invited · until ${dayIN(p.inviteExpiresAt)}` : ''}</p>}
              </div>
              <div className="min-w-0">
                {p.role === 'owner' ? <span className="text-muted-foreground">Every store</span>
                  : <StoreToggles memberId={p.memberId} stores={stores} given={p.stores.map((s) => s.tenantId)} />}
              </div>
              <div className="md:text-right">{p.role !== 'owner' && <RemovePerson memberId={p.memberId} label={p.email} invited={state !== 'active'} />}</div>
            </li>
          )
        })}
      </ul></Section>
    </>
  )
}
