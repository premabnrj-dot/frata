import { notFound } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
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
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Addresses' }

const field = FIELD

function state(n: NameView) {
  // D1·9: a name added beside the current one (block it in Names to take it down).
  if (!n.retiredAt && n.addedAt) return <Badge tone="info">Added</Badge>
  if (!n.retiredAt) return <Badge tone="ok">Current</Badge>
  return n.retiredByFrrata ? <Badge tone="warn">Old · no redirect</Badge> : <Badge>Old · redirects</Badge>
}

/** Shop addresses D1·7 (mockup § 8): the shop's names, Frrata's rename and the freeze. Writes: admin role only. */
export default async function MerchantAddressesPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [name, a, admin, domains] = await Promise.all([merchantName(staff, id), merchantAddresses(staff, id), requireStaff(ADMIN_ONLY), merchantDomains(staff, id)])
  if (!name || !a) notFound()
  const frozen = !!a.frozenAt

  return (
    <>
      <PageHeader title={name} back={{ href: '/admin/merchants', label: 'Merchants' }}
        badges={frozen ? <Badge tone="warn">Address frozen</Badge> : undefined} />
      <MerchantTabs id={id} on="addresses" />
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
                        <ActionForm action={disconnectDomainAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="tenantId" value={id} /><input type="hidden" name="id" value={d.id} />
                          <input name="reason" required minLength={3} maxLength={500} aria-label={`Why disconnect ${d.host}`} placeholder="Reason" data-error="Add a reason, 3 to 500 characters." className={`${field} min-w-0 flex-1`} />
                          <Submit variant="secondary" size="wrap">Disconnect {d.host}</Submit>
                          <span className="basis-full empty:hidden"><FieldMessage name="reason" /></span>
                        </ActionForm>
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
            <ActionForm action={adminRenameAction} className="space-y-3">
              <input type="hidden" name="tenantId" value={id} />
              <label className="flex flex-col gap-1">
                <span className="font-medium">New address</span>
                <span className="flex items-center gap-1 rounded-md border border-input bg-card px-3 font-mono has-[[aria-invalid=true]]:border-danger-mark focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                  <input name="slug" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" autoComplete="off" data-error="Use 3–30 letters, digits and single hyphens." className="h-10 min-w-0 flex-1 bg-transparent outline-none" />
                  <span className="text-muted-foreground">.{SHOP_DOMAIN}</span>
                </span>
                <FieldMessage name="slug" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium">Reason</span>
                <input name="reason" required minLength={3} maxLength={500} data-error="Add a reason, 3 to 500 characters." className={field} />
                <FieldMessage name="reason" />
              </label>
              <Submit variant="secondary" size="wrap">Rename {name}&apos;s address</Submit>
            </ActionForm>
          </Section>
          <Section title={frozen ? `Frozen since ${dayIN(a.frozenAt!)}` : 'Freeze address changes'} className="text-sm">
            <ActionForm action={freezeAddressAction} className="space-y-3">
              <input type="hidden" name="tenantId" value={id} />
              <input type="hidden" name="frozen" value={frozen ? 'no' : 'yes'} />
              <label className="flex flex-col gap-1">
                <span className="font-medium">Reason</span>
                <input name="reason" required minLength={3} maxLength={500} data-error="Add a reason, 3 to 500 characters." className={field} />
                <FieldMessage name="reason" />
              </label>
              <Submit variant="secondary" size="wrap">{frozen ? `Allow ${name}'s address changes` : `Freeze ${name}'s address`}</Submit>
            </ActionForm>
          </Section>
        </div>
      )}
    </>
  )
}
