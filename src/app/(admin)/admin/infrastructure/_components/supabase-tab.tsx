import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { LIMITS, type Alert, type DbHealth } from '@/domains/infra/alerts'
import { RATES_CHECKED, SUPABASE } from '@/domains/infra/rates'
import { bytes, Kpis, Meter, NeedsYou, Rules, Sources } from './parts'

const ROLE = { frata_app: 'The shop and console', frata_admin: 'Admin', other: 'Supabase’s own' } as Record<string, string>

export function SupabaseTab({ h, alerts }: { h: DbHealth | null; alerts: Alert[] }) {
  if (!h) return <Panel title="We could not read the database’s health">Admin’s database login didn’t answer. Try again in a minute.</Panel>
  const open = h.connections.reduce((n, c) => n + c.open, 0), busy = h.connections.reduce((n, c) => n + c.busy, 0)
  const disk = SUPABASE.diskBytes[SUPABASE.plan]
  const wait = h.outboxOldestS === null ? 'none waiting' : h.outboxOldestS < 120 ? `oldest ${h.outboxOldestS} s` : `oldest ${Math.round(h.outboxOldestS / 60)} min`
  return (
    <div className="grid gap-4">
      <Kpis items={[
        { label: 'Plan', value: SUPABASE.plan === 'free' ? 'Free' : 'Pro', sub: 'Mumbai' },
        { label: 'Database', value: bytes(h.dbBytes), sub: `of ${bytes(disk)}` },
        { label: 'Connections', value: `${open} / ${h.maxConnections}`, sub: `${busy} busy now` },
        { label: 'Cache hits', value: h.cacheHit === null ? '—' : `${h.cacheHit}%`, sub: 'Reads served from memory' },
      ]} />
      <NeedsYou alerts={alerts} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section flush title="Now">
          <DataTable label="Connections">
            <DataTableHead><th>Connections</th><th className="text-right">Open</th><th className="text-right">Busy</th></DataTableHead>
            <DataTableBody>
              {h.connections.map((c) => <DataTableRow key={c.role}><Td cell="a">{ROLE[c.role] ?? c.role}</Td><Td cell="b" className="text-right font-num">{c.open}</Td><Td cell="c" className="text-right font-num">{c.busy}</Td></DataTableRow>)}
            </DataTableBody>
          </DataTable>
          <div className="grid gap-3 p-4">
            <Meter label="Outbox waiting" value={`${h.outboxWaiting} · ${wait}`} share={(h.outboxOldestS ?? 0) / LIMITS.outboxWaitS} tone={(h.outboxOldestS ?? 0) > LIMITS.outboxWaitS ? 'danger' : 'neutral'} />
            <Meter label="Outbox gave up today" value={h.outboxDeadToday} share={h.outboxDeadToday ? 1 : 0} tone={h.outboxDeadToday ? 'warn' : 'neutral'} />
            <Meter label="Webhooks not processed" value={h.webhooksWaiting} share={h.webhooksWaiting / LIMITS.webhooksWaiting} tone={h.webhooksWaiting > LIMITS.webhooksWaiting ? 'warn' : 'neutral'} />
          </div>
        </Section>
        <Section flush title="Slowest queries">
          {h.queries.length ? (
            <DataTable label="Slowest queries">
              <DataTableHead><th>Query</th><th className="text-right">Calls</th><th className="text-right">Mean</th><th className="text-right">Total</th></DataTableHead>
              <DataTableBody>
                {h.queries.map((q, i) => <DataTableRow key={i}><Td cell="a" className="font-mono text-xs">{q.shape}</Td><Td cell="b" className="text-right font-mono tabular-nums">{q.calls.toLocaleString('en-IN')}</Td><Td cell="c" className="text-right font-mono tabular-nums">{q.meanMs} ms</Td><Td cell="d" className="text-right font-mono tabular-nums">{Math.round(q.totalMs / 1000)} s</Td></DataTableRow>)}
              </DataTableBody>
            </DataTable>
          ) : <p className="px-4 pb-4 text-sm text-muted-foreground">No query statistics on this database.</p>}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section flush title="Biggest tables">
          <DataTable label="Biggest tables">
            <DataTableHead><th>Table</th><th className="text-right">Rows</th><th className="text-right">Size</th></DataTableHead>
            <DataTableBody>
              {h.tables.map((t) => <DataTableRow key={t.name}><Td cell="a" className="font-num text-xs">{t.name}</Td><Td cell="b" className="text-right font-num">{t.rows.toLocaleString('en-IN')}</Td><Td cell="c" className="text-right font-num">{bytes(t.bytes)}</Td></DataTableRow>)}
            </DataTableBody>
          </DataTable>
        </Section>
        <Rules rules={[
          ['Connections over 80%', `${Math.ceil(h.maxConnections * LIMITS.connectionsShare)} of ${h.maxConnections}`],
          ['Database over 80% of the plan', `${bytes(disk * LIMITS.diskShare)} of ${bytes(disk)}`],
          ['Outbox waiting over 10 minutes', 'Messages, payments and courier calls fall behind'],
          ['A query over 1 second on average', 'From the slowest queries'],
        ]} />
      </div>
      <Sources items={['Connections, size, queries · Frrata’s own read of Postgres, on each visit', 'Outbox and webhooks · Frrata, on each visit', `Plan limits · checked ${RATES_CHECKED}`]} />
    </div>
  )
}
