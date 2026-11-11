import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { emailHealth, emailQueue } from '@/lib/admin/email'
import { dateTimeIN } from '@/lib/format-date'

export const metadata = { title: 'Email health' }

// Admin › Email health (approved mockup v2): every shop's order emails from the roll-up, worst first by bounce and
// complaint rate (SES pauses an account near 5% bounces or 0.1% complaints: frata-integrations), and the queue.
const PERIODS = [[1, 'Today'], [7, '7 days'], [30, '30 days']] as const
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.01 ? 2 : 1)}%` : '—')

export default async function EmailHealth({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const days = sp.days === '1' ? 1 : sp.days === '30' ? 30 : 7
  const [rows, q] = await Promise.all([emailHealth(staff, days), emailQueue(staff)])
  const risk = (r: (typeof rows)[number]) => (r.sent ? Math.max(r.bounced / r.sent / 0.05, r.complained / r.sent / 0.001) : 0)
  const sorted = [...rows].sort((a, b) => risk(b) - risk(a) || b.sent - a.sent)
  const total = rows.reduce((t, r) => ({ sent: t.sent + r.sent, bounced: t.bounced + r.bounced, complained: t.complained + r.complained }), { sent: 0, bounced: 0, complained: 0 })
  return (
    <>
      <PageHeader title="Email health" />
      <div className="mb-4 flex gap-1.5">{PERIODS.map(([d, label]) => <Link key={d} href={`/admin/email?days=${d}`} className={`rounded-full border border-border px-3 py-1 text-sm ${days === d ? 'bg-foreground text-background' : ''}`}>{label}</Link>)}</div>
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-5">
        {[['Sent', total.sent.toLocaleString('en-IN')], ['Bounced', pct(total.bounced, total.sent)], ['Complaints', pct(total.complained, total.sent)],
          ['Waiting to send', q.waiting.toLocaleString('en-IN') + (q.oldest ? ` · since ${dateTimeIN(q.oldest)}` : '')], ['Gave up today', q.dead_today.toLocaleString('en-IN')]].map(([l, v]) => (
          <div key={l} className="bg-card p-4"><dd className="font-mono text-xl">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
        ))}
      </dl>
      {sorted.length ? (
        <DataTable label="Shops' order emails">
          <DataTableHead><th>Shop</th><th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">Bounced</th><th className="text-right">Complaints</th><th className="text-right">Skipped</th></DataTableHead>
          <DataTableBody>
            {sorted.map((r) => (
              <DataTableRow key={r.tenant_id}>
                <Td cell="a" className="font-medium"><Link href={`/admin/merchants/${r.tenant_id}`} className="underline-offset-2 hover:underline">{r.shop}</Link></Td>
                <Td cell="c" label="Sent" className="text-right font-mono">{r.sent.toLocaleString('en-IN')}</Td>
                <Td cell="c" label="Delivered" className="text-right font-mono">{pct(r.delivered, r.sent)}</Td>
                <Td cell="c" label="Bounced" className="text-right font-mono">{r.sent && r.bounced / r.sent >= 0.02 ? <Badge tone="danger">{pct(r.bounced, r.sent)}</Badge> : pct(r.bounced, r.sent)}</Td>
                <Td cell="c" label="Complaints" className="text-right font-mono">{r.sent && r.complained / r.sent >= 0.0005 ? <Badge tone="danger">{pct(r.complained, r.sent)}</Badge> : pct(r.complained, r.sent)}</Td>
                <Td cell="c" label="Skipped" className="text-right font-mono">{r.skipped.toLocaleString('en-IN')}</Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ) : <Panel title="No emails sent in this period" />}
    </>
  )
}
