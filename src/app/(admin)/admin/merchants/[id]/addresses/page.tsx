import { notFound } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { RENAMES_AFTER_OPENING } from '@/domains/addresses/names'
import { merchantAddresses, type NameView } from '@/lib/admin/addresses'
import { merchantName } from '@/lib/admin/merchants'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { MerchantTabs } from '../tabs'
import { adminRenameAction, freezeAddressAction } from './actions'

export const metadata = { title: 'Addresses' }

const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

function state(n: NameView) {
  if (!n.retiredAt) return <Badge tone="ok">Current</Badge>
  return n.retiredByFrrata ? <Badge tone="warn">Old · no redirect</Badge> : <Badge>Old · redirects</Badge>
}

/** Shop addresses D1·7 (mockup § 8): the shop's names, Frrata's rename and the freeze. Writes: admin role only. */
export default async function MerchantAddressesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [name, a, sp, admin] = await Promise.all([merchantName(staff, id), merchantAddresses(staff, id), searchParams, requireStaff(ADMIN_ONLY)])
  if (!name || !a) notFound()
  const frozen = !!a.frozenAt

  return (
    <>
      <PageHeader title={name} back={{ href: '/admin/merchants', label: 'Merchants' }}
        badges={frozen ? <Badge tone="warn">Address frozen</Badge> : undefined} />
      <MerchantTabs id={id} on="addresses" />
      <Notice ok={sp.ok} error={sp.error} />
      <DataTable label={`${name}'s names`}>
        <DataTableHead><th>Name</th><th>State</th><th>Since</th></DataTableHead>
        <DataTableBody>
          {a.names.map((n) => (
            <DataTableRow key={n.name}>
              <Td cell="a" className="font-mono">{shopHost(n.name)}</Td>
              <Td cell="c">{state(n)}</Td>
              <Td cell="d">{dayIN(n.retiredAt ?? n.createdAt)}</Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
      <p className="text-sm text-muted-foreground">
        {a.firstOpenedAt ? `Merchant changes: ${Math.min(a.renamesUsed, RENAMES_AFTER_OPENING)} of ${RENAMES_AFTER_OPENING} used` : 'Not opened yet'}
        {frozen && ` · frozen ${dayIN(a.frozenAt!)}`}
      </p>
      {admin.ok && (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title={`Rename ${name}'s address`} className="text-sm">
            <form action={adminRenameAction} className="space-y-3">
              <input type="hidden" name="tenantId" value={id} />
              <label className="flex flex-col gap-1">
                <span className="font-medium">New address</span>
                <span className="flex items-center gap-1 rounded-md border border-input bg-card px-3 font-mono focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                  <input name="slug" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" autoComplete="off" className="h-10 min-w-0 flex-1 bg-transparent outline-none" />
                  <span className="text-muted-foreground">.{SHOP_DOMAIN}</span>
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Reason</span>
                <input name="reason" required minLength={3} maxLength={500} className={field} />
              </label>
              <Button type="submit" variant="secondary">Rename {name}&apos;s address</Button>
            </form>
          </Section>
          <Section title={frozen ? 'Address changes frozen' : 'Freeze address changes'} className="text-sm">
            <form action={freezeAddressAction} className="space-y-3">
              <input type="hidden" name="tenantId" value={id} />
              <input type="hidden" name="frozen" value={frozen ? 'no' : 'yes'} />
              <label className="flex flex-col gap-1">
                <span className="font-medium">Reason</span>
                <input name="reason" required minLength={3} maxLength={500} className={field} />
              </label>
              <Button type="submit" variant="secondary">{frozen ? `Allow ${name}'s address changes` : `Freeze ${name}'s address`}</Button>
            </form>
          </Section>
        </div>
      )}
    </>
  )
}
