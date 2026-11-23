import Link from 'next/link'
import { z } from 'zod'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Button, button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Tag } from '@/components/ui/badge'
import { FIELD } from '@/components/ui/field'
import { ACTIVITY_KIND_KEYS, ACTIVITY_KINDS, actionWords, visibleKindKeys } from '@/domains/admin/activity-words'
import { activityPeople, listActivity } from '@/lib/admin/activity'
import { merchantName } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { momentIN } from '@/lib/format-date'
import { MerchantTabs } from '../merchants/[id]/tabs'
import { isMasterAdmin } from '@/domains/tenancy/staff-words'

export const metadata = { title: 'Activity' }
export const dynamic = 'force-dynamic'

// Every input through zod (the security review on the plan, M3): ids are uuids, the kind one of the list, the page a
// keyset "at_id" pair. A wrong value is ignored, never echoed.
const Q = z.object({
  shop: z.uuid().optional().catch(undefined),
  who: z.uuid().optional().catch(undefined),
  kind: z.enum(ACTIVITY_KIND_KEYS as [string, ...string[]]).optional().catch(undefined),
  before: z.string().regex(/^\d{4}-\d\d-\d\dT[\d:.]+Z_[0-9a-f-]{36}$/).refine((s) => !Number.isNaN(Date.parse(s.split('_')[0]!))).optional().catch(undefined),
})

/** Admin › Activity (Neel N4, board Reference › Activity): newest first, by store, person and kind; 50 a page. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const q = Q.parse(await searchParams)
  const before = q.before ? { at: new Date(q.before.split('_')[0]!), id: q.before.split('_')[1]! } : undefined
  const [{ rows, next }, people, shopName] = await Promise.all([
    listActivity(staff, { tenant: q.shop, actor: q.who, kind: q.kind as keyof typeof ACTIVITY_KINDS | undefined, before }),
    activityPeople(staff),
    q.shop ? merchantName(staff, q.shop) : Promise.resolve(null),
  ])
  const link = (extra: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ shop: q.shop, who: q.who, kind: q.kind, ...extra })) if (v) u.set(k, v); const s = `${u}`; return s ? `/admin/activity?${s}` : '/admin/activity' }
  const filtered = !!(q.shop || q.who || q.kind)

  return (
    <>
      {q.shop && shopName ? <><PageHeader title={shopName} back={{ href: '/admin/merchants', label: 'Merchants' }} /><MerchantTabs id={q.shop} on="activity" /></> : <PageHeader title="Activity" />}
      <form className="flex flex-wrap items-end gap-2 text-sm" aria-label="Filters">
        {q.shop && <input type="hidden" name="shop" value={q.shop} />}
        {shopName && <Tag className="h-9 gap-1 text-sm">{shopName}<Link href={link({ shop: undefined, before: undefined })} aria-label={`Show every store, not only ${shopName}`} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground">×</Link></Tag>}
        <label className="flex flex-col gap-1"><span className="text-muted-foreground">Person</span>
          <select name="who" defaultValue={q.who ?? ''} className={FIELD}><option value="">Everyone</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.email}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-muted-foreground">Kind</span>
          <select name="kind" defaultValue={q.kind ?? ''} className={FIELD}><option value="">Everything</option>{visibleKindKeys(isMasterAdmin(staff.role)).map((k) => <option key={k} value={k}>{ACTIVITY_KINDS[k].label}</option>)}</select></label>
        <Button type="submit" variant="secondary">Show</Button>
        {filtered && <Link href="/admin/activity" className="inline-flex h-9 items-center text-sm underline-offset-2 hover:underline">Clear filters</Link>}
      </form>
      {rows.length === 0 ? <Panel title={filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'} /> : (
        <DataTable label="Activity">
          <DataTableHead><th>Who</th><th>Store</th><th>What</th><th className="text-right">When</th></DataTableHead>
          <DataTableBody>
            {rows.map((e) => (
              <DataTableRow key={e.id}>
                <Td cell="a" className="font-num">{e.actorKind === 'system' ? 'Frrata' : e.actorEmail ?? 'Someone'}{e.actorKind === 'support' && <span className="text-muted-foreground"> · support visit</span>}</Td>
                <Td cell="c">{e.tenantId && e.store ? <Link href={link({ shop: e.tenantId, before: undefined })} className="underline-offset-2 hover:underline">{e.store}</Link> : <span className="text-muted-foreground">Frrata</span>}</Td>
                <Td cell="e">{actionWords(e.action)}</Td>
                <Td cell="f" className="whitespace-nowrap text-right text-muted-foreground">{momentIN(e.at, new Date())}</Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      <div className="flex justify-end gap-2">
        {before && <Link href={link({ before: undefined })} className={button({ variant: 'secondary' })}>Newest</Link>}
        {next && <Link href={link({ before: `${next.at.toISOString()}_${next.id}` })} className={button({ variant: 'secondary' })}>Older</Link>}
      </div>
    </>
  )
}
