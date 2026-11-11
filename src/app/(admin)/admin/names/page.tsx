import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { RESERVED } from '@/domains/signup/slug'
import { domainsNeedingFrrata, HELD_LIMIT, heldNames, listBlocked, type BlockedKind } from '@/lib/admin/addresses'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { blockNameAction, releaseNameAction, settleDomainAction, unblockNameAction } from './actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Names' }

const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm'
const KIND: Record<BlockedKind, string> = { protected: 'Protected brand', offensive: 'Offensive', domain: 'Domain' }

/** Shop addresses D1·7 (mockup § 8, Admin › Names): blocked names and domains, and names held by a shop's past. */
export default async function NamesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [blocked, held, sp, admin, waiting] = await Promise.all([listBlocked(staff), heldNames(staff), searchParams, requireStaff(ADMIN_ONLY), domainsNeedingFrrata(staff)])
  const can = admin.ok

  return (
    <>
      <PageHeader title="Names" />
      <Notice ok={sp.ok} error={sp.error} />
      {waiting.length > 0 && (
        <Section title="Domains" flush>
          <DataTable label="Domains waiting for Frrata" rows={can ? 'form' : 'list'}>
            <DataTableHead><th>Domain</th><th>Shop</th><th>State</th><th>Since</th>{can && <th><span className="sr-only">Action</span></th>}</DataTableHead>
            <DataTableBody>
              {waiting.map((d) => (
                <DataTableRow key={d.id}>
                  <Td cell="a" className="font-mono">{d.host}</Td>
                  <Td cell="c"><Link href={`/admin/merchants/${d.tenantId}/addresses`} className="underline-offset-2 hover:underline">{d.shop}</Link></Td>
                  <Td cell="e">{d.contestAt ? <Badge tone="warn">Claimed · another shop&apos;s main</Badge> : <Badge tone="danger">Not working</Badge>}</Td>
                  <Td cell="d">{dayIN(d.contestAt ?? d.failingSince ?? d.claimedAt)}</Td>
                  {can && (
                    <Td cell="f">
                      {d.contestAt && (
                        <form action={settleDomainAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={d.id} />
                          <input name="reason" required minLength={3} maxLength={500} aria-label={`Why settle ${d.host}`} placeholder="Reason" className={`${field} min-w-0 flex-1`} />
                          <Submit name="move" value="yes" variant="secondary" size="wrap">Move to {d.shop}</Submit>
                          <Submit name="move" value="no" variant="secondary" size="wrap">Refuse</Submit>
                        </form>
                      )}
                    </Td>
                  )}
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </Section>
      )}
      {can && (
        <Section title="Block a name" className="text-sm">
          <form action={blockNameAction} className="grid gap-3 md:grid-cols-[1fr_10rem_1fr_auto] md:items-end">
            <label className="flex flex-col gap-1"><span className="font-medium">Name or domain</span>
              <input name="name" required minLength={3} maxLength={253} autoComplete="off" className={`${field} font-mono`} /></label>
            <label className="flex flex-col gap-1"><span className="font-medium">Kind</span>
              <select name="kind" required className={field}>{(Object.keys(KIND) as BlockedKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="font-medium">Reason</span>
              <input name="reason" required minLength={3} maxLength={500} className={field} /></label>
            <Submit variant="secondary">Block name</Submit>
          </form>
        </Section>
      )}
      <Section title="Blocked" flush>
        {blocked.length ? (
          <DataTable label="Blocked names" rows={can ? 'form' : 'list'}>
            <DataTableHead><th>Name or domain</th><th>Kind</th><th>Reason</th><th>Added</th>{can && <th><span className="sr-only">Action</span></th>}</DataTableHead>
            <DataTableBody>
              {blocked.map((b) => (
                <DataTableRow key={b.name}>
                  <Td cell="a" className="font-mono">{b.name}</Td>
                  <Td cell="c">{KIND[b.kind]}</Td>
                  <Td cell="e">{b.reason}</Td>
                  <Td cell="d">{dayIN(b.createdAt)}</Td>
                  {can && (
                    <Td cell="f" className="text-right">
                      <form action={unblockNameAction} className="flex flex-wrap items-center justify-end gap-2">
                        <input type="hidden" name="name" value={b.name} />
                        <input name="reason" required minLength={3} maxLength={500} aria-label={`Why unblock ${b.name}`} placeholder="Reason" className={`${field} min-w-0 flex-1`} />
                        <Submit variant="secondary" size="wrap">Unblock {b.name}</Submit>
                      </form>
                    </Td>
                  )}
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        ) : <p className="p-4 text-sm text-muted-foreground">None.</p>}
      </Section>
      <Section title={`Frrata's words · ${RESERVED.size}`}>
        <p className="font-mono text-sm leading-relaxed">{[...RESERVED].sort().join(' · ')}</p>
      </Section>
      <Section title={held.length >= HELD_LIMIT ? `Held · first ${HELD_LIMIT}` : 'Held'} flush>
        {held.length ? (
          <DataTable label="Held names" rows={can ? 'form' : 'list'}>
            <DataTableHead><th>Name</th><th>Shop</th><th>Since</th>{can && <th>Release</th>}</DataTableHead>
            <DataTableBody>
              {held.map((h) => (
                <DataTableRow key={h.name}>
                  <Td cell="a" className="font-mono">{h.name}{h.retiredByFrrata && <> <Badge tone="warn">No redirect</Badge></>}</Td>
                  <Td cell="c"><Link href={`/admin/merchants/${h.tenantId}/addresses`} className="underline-offset-2 hover:underline">{h.shop}</Link></Td>
                  <Td cell="d">{dayIN(h.retiredAt)}</Td>
                  {can && (
                    <Td cell="f">
                      <form action={releaseNameAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="name" value={h.name} />
                        <input name="reason" required minLength={3} maxLength={500} aria-label={`Why release ${h.name}`} placeholder="Reason" className={`${field} min-w-0 flex-1`} />
                        <Submit variant="secondary">Release {h.name}</Submit>
                      </form>
                    </Td>
                  )}
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        ) : <p className="p-4 text-sm text-muted-foreground">None.</p>}
      </Section>
    </>
  )
}
