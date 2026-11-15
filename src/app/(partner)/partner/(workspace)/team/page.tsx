import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { PictoTile } from '@/components/brand/illustrations'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { memberState, partnerCan, PARTNER_ROLE_LABEL } from '@/domains/partners/team'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerClients, partnerTeam } from '@/lib/db/partners'
import { InviteButton, RemovePerson, ResendInvite, RoleSelect, StoreToggles } from './team-parts'
import { RolesCard } from './roles-card'
import { ApprovePasskey, DeletePasskeys } from './team-passkeys'

/** "arjun.k@pixelthread.in" → "Arjun": the name the approval card and its buttons use (mockup screen 10). */
const firstName = (email: string) => { const n = email.split('@')[0]!.split(/[._+-]/)[0] ?? ''; return n ? n[0]!.toUpperCase() + n.slice(1) : email }
const daysLeft = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 86_400_000))

export const metadata = { title: 'Team' }

/**
 * Partner workspace › Team (T1a; approved Studio mockup, Team; T1c approved mockup screens 1–3). The owner invites Leads
 * and Builders, gives each the stores they work on, changes Lead ↔ Builder, and removes them. Leads and Builders don't
 * see this page; every write is re-checked in its definer.
 */
export default async function TeamPage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  if (!partnerCan(auth.partner.memberRole, 'manageTeam')) return <Panel title="Only the partner’s owner manages the team" />
  const now = new Date()
  const [team, clients] = await Promise.all([
    partnerTeam(auth).catch((err) => { console.error('[team]', err instanceof Error ? err.name : err); return null }),
    partnerClients(auth).catch(() => null),
  ])
  if (!team || !clients) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
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
            <p className="mt-1 text-sm text-muted-foreground">Leads and Builders work on the stores you give them.</p>
          </div>
        </Section>
      )}
      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <Section flush ariaLabel="People"><ul data-list className="divide-y divide-border">
        {people.map((p) => {
          const state = memberState(p, now)
          const name = p.isYou ? 'You' : p.email
          return (
            <li key={p.memberId} className="grid gap-x-3 gap-y-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center">
              <div className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-info text-sm font-semibold text-info-text">{(p.isYou ? 'Y' : p.email[0] ?? '?').toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{name}</span>
                    {p.role === 'owner' && <Badge tone="info">{PARTNER_ROLE_LABEL[p.role]}</Badge>}
                  </p>
                  {!p.isYou && <p className="truncate text-small text-muted-foreground">{PARTNER_ROLE_LABEL[p.role]} · {
                    state === 'active' ? (p.request ? 'waiting for your approval' : p.passkeys === 0 ? 'joined, no passkey' : `${p.passkeys} ${p.passkeys === 1 ? 'passkey' : 'passkeys'}`)
                      : state === 'invited' && p.inviteExpiresAt ? `invited · ${daysLeft(p.inviteExpiresAt, now)} ${daysLeft(p.inviteExpiresAt, now) === 1 ? 'day' : 'days'} left` : state === 'expired' ? 'invite ended' : ''}</p>}
                </div>
              </div>
              <div className="min-w-0">
                {p.role === 'owner' ? <span className="text-muted-foreground">Every store</span>
                  : <StoreToggles memberId={p.memberId} stores={stores} given={p.stores.map((s) => s.tenantId)} />}
              </div>
              <div className="flex flex-wrap items-center gap-1 md:justify-end">
                {state === 'active' && p.role !== 'owner' && p.passkeys > 0 && !p.request && <Badge tone="ok">Active</Badge>}
                {state === 'active' && p.request && !p.isYou && <ApprovePasskey w={{ memberId: p.memberId, email: p.email, name: firstName(p.email), device: p.request.device, city: p.request.city,
                  askedMinutes: Math.max(0, Math.floor((now.getTime() - p.request.createdAt.getTime()) / 60_000)) }} />}
                {state === 'active' && p.role !== 'owner' && p.passkeys > 0 && <DeletePasskeys memberId={p.memberId} name={firstName(p.email)} count={p.passkeys} />}
                {state === 'invited' && <ResendInvite memberId={p.memberId} />}
                {p.role !== 'owner' && state !== 'expired' && <RoleSelect memberId={p.memberId} label={p.email} role={p.role} />}
                {p.role !== 'owner' && <RemovePerson memberId={p.memberId} label={p.email} invited={state !== 'active'} />}
              </div>
            </li>
          )
        })}
      </ul></Section>
      <RolesCard />
      </div>
    </>
  )
}
