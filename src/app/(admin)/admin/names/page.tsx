import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { RESERVED } from '@/domains/signup/slug'
import { domainsNeedingFrrata, HELD_LIMIT, heldNames, listBlocked, type BlockedKind } from '@/lib/admin/addresses'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN, sinceIN } from '@/lib/format-date'
import { blockNameAction, releaseNameAction, settleDomainAction, unblockNameAction } from './actions'
import { FieldMessage } from '@/components/ui/action-form'
import { ViewTabs } from '@/components/ui/view-tabs'
import { DialogButton, type DialogSpec } from '../_components/form-dialog'
import { NeedsBand } from '../_components/needs-band'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Names' }

const field = FIELD
const KIND: Record<BlockedKind, string> = { protected: 'Protected brand', offensive: 'Offensive', domain: 'Domain' }

const TABS = [['blocked', 'Blocked'], ['held', 'Held'], ['reserved', 'Reserved']] as const
type Tab = (typeof TABS)[number][0]
const Why = ({ label = 'Why' }: { label?: string }) => <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span><input name="reason" required minLength={3} maxLength={500} data-error="Add a reason, 3 to 500 characters." className={field} /><FieldMessage name="reason" /></label>

/** Admin › Names (Neel N4, board Names; shop addresses D1·7): a domain that waits leads; the lists in tabs. */
export default async function NamesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [sp, blocked, held, admin, waiting] = await Promise.all([searchParams, listBlocked(staff), heldNames(staff), requireStaff(ADMIN_ONLY), domainsNeedingFrrata(staff)])
  const can = admin.ok
  const now = new Date()
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'blocked'
  const count: Record<Tab, number> = { blocked: blocked.length, held: held.length, reserved: RESERVED.size }
  const block: DialogSpec = { label: 'Block a name', title: 'Block a name?', description: 'No store can take it until it is unblocked.', action: blockNameAction, keep: 'Don’t block', go: 'Block name', fields: <>
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Name or domain</span><input name="name" required minLength={3} maxLength={253} autoComplete="off" data-error="Use letters, digits and single hyphens, or a domain." className={`${field} font-mono`} /><FieldMessage name="name" /></label>
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Kind</span><select name="kind" required className={field}>{(Object.keys(KIND) as BlockedKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></label>
    <Why /></> }

  return (
    <>
      <PageHeader title="Names" actions={can && <DialogButton spec={block} />} />
      {waiting.map((d) => d.contestAt ? (
        <NeedsBand key={d.id} title={`${d.shop} claims ${d.host}.`} line={`Another store uses it as its main address · ${sinceIN(d.contestAt, now)}`}
          action={can ? <div className="flex flex-wrap gap-2">
            <DialogButton spec={{ label: 'Keep where it is', title: `Keep ${d.host} where it is?`, description: `${d.shop} is told its claim was refused.`, action: settleDomainAction, keep: 'Not now', go: 'Keep where it is',
              fields: <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="move" value="no" /><Why label="Reason both stores read" /></> }} />
            <DialogButton spec={{ label: `Move to ${d.shop}`, title: `Move ${d.host} to ${d.shop}?`, description: 'The other store’s Frrata address keeps working.', action: settleDomainAction, keep: 'Keep where it is', go: `Move to ${d.shop}`,
              fields: <><input type="hidden" name="id" value={d.id} /><input type="hidden" name="move" value="yes" /><Why label="Reason both stores read" /></> }} />
          </div> : 'A master admin settles a claim.'} />
      ) : (
        <NeedsBand key={d.id} tone="bad" title={`${d.host} isn't working.`} line={`${d.shop}${d.failingSince ? ` · since ${dayMonthIN(d.failingSince)}` : ''}`}
          action={<Link href={`/admin/merchants/${d.tenantId}/addresses`} className="text-sm underline-offset-2 hover:underline">Open {d.shop}</Link>} />
      ))}

      <ViewTabs label="Names" tabs={TABS.map(([k, label]) => ({ href: `/admin/names?tab=${k}`, label, count: count[k], current: tab === k }))} />

      {tab === 'blocked' && (blocked.length === 0 ? <Panel title="Nothing is blocked" /> : (
        <DataTable label="Blocked names" rows={can ? 'form' : 'list'}>
          <DataTableHead><th>Name</th><th>Kind</th><th>Reason</th><th>Added</th>{can && <th><span className="sr-only">Action</span></th>}</DataTableHead>
          <DataTableBody>
            {blocked.map((b) => (
              <DataTableRow key={b.name}>
                <Td cell="a" className="font-mono">{b.name}</Td>
                <Td cell="c">{KIND[b.kind]}</Td>
                <Td cell="e">{b.reason}</Td>
                <Td cell="d">{dayMonthIN(b.createdAt)}</Td>
                {can && <Td cell="f" className="text-right"><DialogButton spec={{ label: `Unblock ${b.name}`, title: `Unblock ${b.name}?`, description: 'Any store can take it again.', action: unblockNameAction, keep: 'Keep blocked', go: `Unblock ${b.name}`,
                  fields: <><input type="hidden" name="name" value={b.name} /><Why /></> }} /></Td>}
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ))}

      {tab === 'held' && (held.length === 0 ? <Panel title="No name is held" /> : (
        <DataTable label={held.length >= HELD_LIMIT ? `Held names, first ${HELD_LIMIT}` : 'Held names'} rows={can ? 'form' : 'list'}>
          <DataTableHead><th>Name</th><th>Store</th><th>Since</th>{can && <th><span className="sr-only">Action</span></th>}</DataTableHead>
          <DataTableBody>
            {held.map((h) => (
              <DataTableRow key={h.name}>
                <Td cell="a" className="font-mono">{h.name}{h.retiredByFrrata && <> <Badge tone="warn">No redirect</Badge></>}</Td>
                <Td cell="c"><Link href={`/admin/merchants/${h.tenantId}/addresses`} className="underline-offset-2 hover:underline">{h.shop}</Link></Td>
                <Td cell="d">{dayMonthIN(h.retiredAt)}</Td>
                {can && <Td cell="f" className="text-right"><DialogButton spec={{ label: `Release ${h.name}`, title: `Release ${h.name}?`, description: 'Any store can take it. It no longer leads to the old store.', action: releaseNameAction, keep: 'Keep held', go: `Release ${h.name}`,
                  fields: <><input type="hidden" name="name" value={h.name} /><Why /></> }} /></Td>}
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ))}

      {tab === 'reserved' && <p className="font-mono text-sm leading-relaxed">{[...RESERVED].sort().join(' · ')}</p>}
    </>
  )
}
