import { notFound } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { RENAMES_AFTER_OPENING } from '@/domains/addresses/names'
import { merchantAddresses, merchantDomains, type NameView } from '@/lib/admin/addresses'
import { DOMAIN_CHIP, domainState } from '@/domains/addresses/domain-state'
import { merchantName } from '@/lib/admin/merchants'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import { MerchantTabs } from '../tabs'
import { adminRenameAction, disconnectDomainAction, freezeAddressAction } from './actions'

export const metadata = { title: 'Addresses' }

const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

function state(n: NameView) {
  // D1·9: a name added beside the current one (block it in Names to take it down).
  if (!n.retiredAt && n.addedAt) return <Badge tone="info">Added</Badge>
  if (!n.retiredAt) return <Badge tone="ok">Current</Badge>
  return n.retiredByFrrata ? <Badge tone="warn">Old · no redirect</Badge> : <Badge>Old · redirects</Badge>
}

/** Shop addresses D1·7 (mockup § 8): the shop's names, Frrata's rename and the freeze. Writes: admin role only. */
export default async function MerchantAddressesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [name, a, sp, admin, domains] = await Promise.all([merchantName(staff, id), merchantAddresses(staff, id), searchParams, requireStaff(ADMIN_ONLY), merchantDomains(staff, id)])
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
      </p>
      {domains.length > 0 && (
        <DataTable label={`${name}'s domains`} rows={admin.ok ? 'form' : 'list'}>
          <DataTableHead><th>Domain</th><th>State</th><th>Since</th>{admin.ok && <th><span className="sr-only">Action</span></th>}</DataTableHead>
          <DataTableBody>
            {domains.map((d) => {
              const c = DOMAIN_CHIP[domainState(d)]
              return (
                <DataTableRow key={d.id} dimmed={!!d.removedAt}>
                  <Td cell="a" className="font-mono">{d.host}</Td>
                  <Td cell="c"><Badge tone={c.tone}>{c.words}</Badge></Td>
                  <Td cell="d">{dayIN(d.removedAt ?? d.mainAt ?? d.provedAt ?? d.claimedAt)}</Td>
                  {admin.ok && (
                    <Td cell="f">
                      {!d.removedAt && (
                        <form action={disconnectDomainAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="tenantId" value={id} /><input type="hidden" name="id" value={d.id} />
                          <input name="reason" required minLength={3} maxLength={500} aria-label={`Why disconnect ${d.host}`} placeholder="Reason" className={`${field} min-w-0 flex-1`} />
                          <Button type="submit" variant="secondary" size="wrap">Disconnect {d.host}</Button>
                        </form>
                      )}
                    </Td>
                  )}
                </DataTableRow>
              )
            })}
          </DataTableBody>
        </DataTable>
      )}
      {admin.ok && (
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <Section title="Rename" className="text-sm">
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
              <Button type="submit" variant="secondary" size="wrap">Rename {name}&apos;s address</Button>
            </form>
          </Section>
          <Section title={frozen ? `Frozen since ${dayIN(a.frozenAt!)}` : 'Freeze address changes'} className="text-sm">
            <form action={freezeAddressAction} className="space-y-3">
              <input type="hidden" name="tenantId" value={id} />
              <input type="hidden" name="frozen" value={frozen ? 'no' : 'yes'} />
              <label className="flex flex-col gap-1">
                <span className="font-medium">Reason</span>
                <input name="reason" required minLength={3} maxLength={500} className={field} />
              </label>
              <Button type="submit" variant="secondary" size="wrap">{frozen ? `Allow ${name}'s address changes` : `Freeze ${name}'s address`}</Button>
            </form>
          </Section>
        </div>
      )}
    </>
  )
}
