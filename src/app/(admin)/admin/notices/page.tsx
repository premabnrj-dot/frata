import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { NOTICE_TYPES, TYPE_LABEL } from '@/domains/email/notices'
import { noticeBatches } from '@/lib/admin/notices'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN } from '@/lib/format-date'
import { sendNoticeAction } from './actions'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Notices' }

const field = `${FIELD} w-full`

/** Admin › Notices (mockup v2 screen 9): write to every shop, a plan or one shop; what was sent, by batch. */
export default async function AdminNoticesPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [admin, batches] = await Promise.all([requireStaff(ADMIN_ONLY), noticeBatches(staff).catch(() => null)])
  return (
    <>
      <PageHeader title="Notices" />
      {admin.ok ? (
        <Section title="New notice">
          <ActionForm action={sendNoticeAction} className="grid max-w-xl gap-3 text-sm">
            <label className="grid gap-1"><span className="font-medium">To</span>
              <select name="audience" className={field} defaultValue="all"><option value="all">Every shop</option><option value="plan">Shops on a plan</option><option value="shop">One shop</option></select></label>
            <label className="grid gap-1"><span className="font-medium">Plan</span>
              <select name="plan" className={field} defaultValue="growth"><option value="launch">Launch</option><option value="growth">Growth</option><option value="scale">Scale</option></select><FieldMessage name="plan" /></label>
            <label className="grid gap-1"><span className="font-medium">Shop id</span><input name="tenantId" className={`${field} font-mono`} placeholder="Only for one shop" /><FieldMessage name="tenantId" /></label>
            <label className="grid gap-1"><span className="font-medium">Kind</span>
              <select name="type" className={field} defaultValue="product_update">{NOTICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
            <label className="grid gap-1"><span className="font-medium">Title</span><input name="title" required minLength={3} maxLength={120} data-error="A title of 3 to 120 characters." className={field} /><FieldMessage name="title" /></label>
            <label className="grid gap-1"><span className="font-medium">Message</span><textarea name="body" maxLength={1000} rows={4} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" /></label>
            <label className="grid gap-1"><span className="font-medium">Link</span><input name="href" className={`${field} font-mono`} placeholder="/console/settings/billing" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="email" defaultChecked  />Also email</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="required"  />Required (billing, security, Frrata acted)</label>
            <div><Submit>Send</Submit></div>
          </ActionForm>
        </Section>
      ) : null}
      <Section title="Sent">
        {!batches ? <p className="text-sm text-muted-foreground">We could not load what was sent.</p> : batches.length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
          <DataTable label="Sent notices">
            <DataTableHead><th>Title</th><th>Kind</th><th className="text-right">Shops</th><th>When</th></DataTableHead>
            <DataTableBody>
              {batches.map((b) => (
                <DataTableRow key={b.batch}>
                  <Td cell="a">{b.title}</Td>
                  <Td cell="d"><Badge tone={b.required ? 'warn' : 'neutral'}>{TYPE_LABEL[b.type as keyof typeof TYPE_LABEL] ?? b.type}</Badge></Td>
                  <Td cell="b" className="text-right font-mono tabular-nums">{b.shops}</Td>
                  <Td cell="c">{dateTimeIN(b.at)}</Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Section>
    </>
  )
}
