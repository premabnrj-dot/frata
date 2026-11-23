import { pageRoles } from '@/domains/settings/groups'
import Link from 'next/link'
import { SettingsHead } from '../_components/settings-head'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { shopPeople } from '@/lib/db/partners'
import { peopleView } from '@/lib/db/people'
import { dayIN } from '@/lib/format-date'
import { RemovePartner } from './remove-partner'
import { AddPerson } from './add-person'
import { InviteButton, RemovePerson } from './row-actions'
import { shopModules } from '@/lib/queries/modules'
import { BUILDER_LABEL, ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'
import { mayGive, requestState, ROLES_GIVEN_BY } from '@/domains/tenancy/people'
import { InfoTip } from '@/components/ui/info-tip'

export const metadata = { title: 'People' }

/** Settings › People (approved mockup 2026-11-23, docs/mockups/2026-11-23-add-partner.html): the store's own people with
 *  Add a person, and the partner. Owners and Managers see it; a support visit reads it and changes nothing. */
export default async function PeoplePage() {
  const auth = await requireMember(pageRoles('people'))
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or a Manager can see people' : auth.message} />
  const t = auth.membership.tenantId
  const [people, view, gstOn] = await Promise.all([
    shopPeople(t).catch((err) => { console.error('[people]', err instanceof Error ? err.name : err); return null }),
    peopleView(t, auth.userId).catch((err) => { console.error('[people] view', err instanceof Error ? err.name : err); return null }),
    // The Accountant's login is part of the GST app: offered while GST is on.
    shopModules(t, new Date().toISOString()).then((m) => m.access.gst.usable).catch(() => false),
  ])
  if (!people || !view) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const visit = !!auth.membership.supportSessionId
  const me = auth.membership.role
  const acts = !visit && (me === 'owner' || me === 'admin')
  const now = new Date()
  const own = people.filter((p) => p.role !== 'partner' && p.role !== 'builder')
  const partnerPeople = people.filter((p) => p.role === 'partner' || p.role === 'builder')
  const req = view.request
  const reqState = req ? requestState(req, now) : null
  const hasPartner = partnerPeople.length > 0
  const room = view.limit ? `${view.planName ? `Your ${view.planName} plan` : 'Your plan'} has room for ${view.limit} ${view.limit === 1 ? 'person' : 'people'}.` : null
  const roles = acts && (me === 'owner' || me === 'admin') ? [...ROLES_GIVEN_BY[me]] : []
  const showPartnerCard = hasPartner || reqState === 'open' || reqState === 'declined' || reqState === 'expired'
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/console/settings" className="text-sm text-muted-foreground hover:text-foreground">← Settings</Link>
      <SettingsHead page="people" role={me} />
      <Section flush ariaLabel="People">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-1">
          <h2 className="font-semibold">People</h2>
          {view.limit > 0 && <Badge tone="neutral" className="tabular-nums">{`${view.used} of ${view.limit} people${view.planName ? ` on ${view.planName}` : ''}`}</Badge>}
          <span className="flex-1" />
          {acts && <AddPerson roles={roles} partnerOpen={me === 'owner' && !hasPartner && reqState !== 'open'} gstOn={gstOn} atLimit={view.used >= view.limit} room={room} />}
        </div>
        <ul data-list className="divide-y divide-border">
          {own.map((p) => {
            const you = p.userId === auth.userId
            return (
              <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.email ?? 'No email'}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Badge tone="neutral">{ROLE_LABEL[p.role as MemberRole] ?? p.role}</Badge><span>{you ? 'You' : `Since ${dayIN(p.since)}`}</span></p>
                </div>
                {acts && !you && mayGive(me, p.role) && <RemovePerson member={p.userId} name={p.email ?? 'this person'} />}
              </li>
            )
          })}
          {view.invites.map((i) => {
            const expired = i.expiresAt <= now
            const label = ROLE_LABEL[i.role as MemberRole] ?? i.role
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge tone={expired ? 'neutral' : 'warn'}>{`${label} · ${expired ? 'Expired' : 'Invited'}`}</Badge>
                    {!expired && <span>Expires {dayIN(i.expiresAt)}</span>}
                  </p>
                </div>
                {acts && mayGive(me, i.role) && (expired ? <InviteButton kind="again" email={i.email} role={i.role} /> : <InviteButton kind="cancel" id={i.id} />)}
              </li>
            )
          })}
        </ul>
      </Section>
      {showPartnerCard && (
        <Section flush ariaLabel="Partner">
          <h2 className="px-4 pt-3 pb-1 font-semibold">Partner</h2>
          <ul data-list className="divide-y divide-border">
            {hasPartner ? partnerPeople.map((p) => {
              // A partner's people are listed with their partner and their place in it (T1a); removing the partner ends
              // every one of them. A partner Frrata paused is listed so the owner can still remove it.
              const person = (p.role === 'partner' && p.partnerRole === 'lead') || p.role === 'builder'
              const role = p.partnerPaused ? { label: 'Partner · Paused', tone: 'warn' as const }
                : p.role === 'builder' ? { label: `Partner · ${BUILDER_LABEL}`, tone: 'info' as const }
                : { label: person ? 'Partner · Lead' : 'Partner', tone: 'info' as const }
              return (
                <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{person ? p.partnerName ?? 'A partner person' : p.partnerName ?? p.email ?? 'No email'}</p>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Badge tone={role.tone}>{role.label}</Badge>
                      {p.role === 'builder' && <InfoTip about={`Partner · ${BUILDER_LABEL}`}>Sees products and the store preview. No orders, shoppers or costs.</InfoTip>}
                      <span>{p.partnerPaused ? 'Paused by Frrata' : `Since ${dayIN(p.since)}`}</span>
                    </p>
                  </div>
                  {p.role === 'partner' && !person && me === 'owner' && !visit && <RemovePartner name={p.partnerName ?? 'the partner'} shop={auth.membership.tenantName} />}
                </li>
              )
            }) : req && (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{reqState === 'open' ? req.email : 'No partner'}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {reqState === 'open' && <><Badge tone="warn">Partner · Invited</Badge><span>Expires {dayIN(req.expiresAt)}</span></>}
                    {reqState === 'declined' && <Badge tone="neutral">{`${req.email} declined`}</Badge>}
                    {reqState === 'expired' && <Badge tone="neutral">Invitation expired</Badge>}
                  </p>
                </div>
                {reqState === 'open' && me === 'owner' && !visit && <InviteButton kind="cancel_partner" />}
              </li>
            )}
          </ul>
        </Section>
      )}
    </div>
  )
}
