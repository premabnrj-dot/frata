import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { shopPeople } from '@/lib/db/partners'
import { dayIN } from '@/lib/format-date'
import { RemovePartner } from './remove-partner'
import { ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'

export const metadata = { title: 'People' }


/** Settings › People: who works on this shop. Owners and admins see it; only the owner removes the partner. */
export default async function PeoplePage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can see people' : auth.message} />
  const people = await shopPeople(auth.membership.tenantId).catch((err) => { console.error('[people]', err instanceof Error ? err.name : err); return null })
  if (!people) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const canRemove = auth.membership.role === 'owner' && !auth.membership.supportSessionId
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/console/settings" className="text-sm text-muted-foreground hover:text-foreground">← Settings</Link>
      <PageHeader title="People" />
      <Section flush ariaLabel="People"><ul className="divide-y divide-border">
        {people.map((p) => {
          const role = { label: ROLE_LABEL[p.role as MemberRole] ?? p.role, tone: p.role === 'partner' ? 'info' as const : 'neutral' as const }
          const you = p.userId === auth.userId
          return (
            <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.partnerName ?? p.email ?? 'Unknown'}</p>
                {p.email && <p className="truncate font-mono text-xs text-muted-foreground">{p.email}</p>}
              </div>
              <Badge tone={role.tone}>{role.label}</Badge>
              <span className="w-40 text-sm text-muted-foreground">{you ? 'You' : p.role === 'partner' ? `Built this store · ${dayIN(p.since)}` : `Since ${dayIN(p.since)}`}</span>
              {p.role === 'partner' && canRemove && <RemovePartner name={p.partnerName ?? 'the partner'} shop={auth.membership.tenantName} />}
            </li>
          )
        })}
      </ul></Section>
    </div>
  )
}
