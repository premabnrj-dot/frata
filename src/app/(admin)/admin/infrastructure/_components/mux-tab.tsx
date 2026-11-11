import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import type { Alert } from '@/domains/infra/alerts'
import { MUX_RULES, type MuxFacts } from '@/domains/infra/mux'
import { MUX, RATES_CHECKED } from '@/domains/infra/rates'
import type { Pull } from '@/lib/admin/infra'
import { formatUsd } from '@/lib/format'
import { dateTimeIN } from '@/lib/format-date'
import { Kpis, Meter, NeedsYou, Rules, Sources } from './parts'

const WHY: Record<string, string> = { not_connected: 'No read-only Mux token yet', refused: 'Mux refused the token', unavailable: 'Mux didn’t answer', bad_reply: 'Mux’s reply wasn’t readable' }
const n = (x: number) => x.toLocaleString('en-IN')
const PLAN: Record<string, string> = { trial: 'Trial', launch: 'Launch', growth: 'Growth', scale: 'Scale' }

export function MuxTab({ f, alerts, pulls, connected, videosRead }: { f: MuxFacts; alerts: Alert[]; pulls: { last: Pull | null; lastOk: Pull | null }; connected: boolean; videosRead: boolean }) {
  if (!videosRead) return <Panel title="We could not read the videos">Admin’s database login didn’t answer. Try again in a minute.</Panel>
  const delivery = connected || pulls.lastOk
  return (
    <div className="grid gap-4">
      {!delivery ? <p role="status" className="rounded-md bg-info px-3 py-2 text-sm text-info-text">Delivery arrives with a read-only Mux token. Videos and storage below are Frrata’s own.</p>
        : pulls.last && !pulls.last.ok ? <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{pulls.lastOk ? `Last read ${dateTimeIN(pulls.lastOk.at)} · ` : ''}{WHY[pulls.last.why ?? ''] ?? 'The latest read didn’t work'}</p> : null}
      <Kpis items={[
        { label: 'Month to date · estimate', value: formatUsd(f.estimateMicros), sub: 'Storage, MP4s, 720p prep, delivery' },
        { label: 'Delivered · to 12 h ago', value: `${n(f.deliveredMinutes)} min`, sub: `of ${n(f.freeMinutes)} free · on pace for ${n(f.projectedMinutes)}` },
        { label: 'Live videos', value: n(f.liveVideos), sub: `${f.liveProduct} product · ${f.liveLoops} Look loops` },
        { label: 'Stored', value: `${n(f.storedMinutes)} min`, sub: `${n(f.mp4Minutes)} min of 720p MP4s` },
      ]} />
      <NeedsYou alerts={alerts} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="This month">
          <div className="grid gap-3">
            <Meter label="Delivered minutes" value={`${n(f.deliveredMinutes)} / ${n(f.freeMinutes)} free`} share={f.deliveredMinutes / f.freeMinutes} tone={f.projectedMinutes > f.freeMinutes ? 'warn' : 'neutral'} />
            <Meter label="Uploads today" value={`${f.uploadsToday} · ${f.failedToday} didn’t work`} share={f.uploadsToday ? f.failedToday / f.uploadsToday : 0} tone={f.failedToday && f.failedToday / Math.max(1, f.uploadsToday) > MUX_RULES.failedShare ? 'warn' : 'neutral'} />
          </div>
        </Section>
        <Section flush title="Most watched">
          {f.top.length ? (
            <DataTable label="Most watched">
              <DataTableHead><th>Video</th><th>Shop</th><th className="text-right">Minutes</th><th className="text-right">Share</th></DataTableHead>
              <DataTableBody>
                {f.top.map((t) => <DataTableRow key={t.assetId}><Td cell="a">{t.label}</Td><Td cell="b">{t.shop}</Td><Td cell="c" className="text-right font-mono tabular-nums">{n(t.minutes)}</Td><Td cell="d" className="text-right font-mono tabular-nums">{Math.round(t.share * 100)}%</Td></DataTableRow>)}
              </DataTableBody>
            </DataTable>
          ) : <p className="px-4 pb-4 text-sm text-muted-foreground">No delivery this month yet.</p>}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section flush title="By shop">
          {f.shops.length ? (
            <DataTable label="By shop">
              <DataTableHead><th>Shop</th><th>Plan</th><th className="text-right">Live</th><th className="text-right">Delivered</th></DataTableHead>
              <DataTableBody>
                {f.shops.slice(0, 12).map((s) => <DataTableRow key={s.tenantId}><Td cell="a">{s.shop}</Td><Td cell="b">{PLAN[s.plan] ?? s.plan}</Td><Td cell="c" className="text-right font-mono tabular-nums">{n(s.liveProduct)} / {n(s.cap)}</Td><Td cell="d" className="text-right font-mono tabular-nums">{n(s.minutes)} min</Td></DataTableRow>)}
              </DataTableBody>
            </DataTable>
          ) : <p className="px-4 pb-4 text-sm text-muted-foreground">No shop has product videos yet.</p>}
        </Section>
        <Rules rules={[
          ['Delivered minutes on pace past the free 100,000', `Then $${MUX.deliveryPerMinuteUsd} a minute`],
          ['One video over 25% of delivery', 'A reel shared outside the shop'],
          ['Uploads that didn’t work over 20% in a day', 'Too long, too short, under 720p or lost'],
          ['Mux’s own spending alerts', 'Email from Mux at the amounts set in Mux (paid plans)'],
        ]} />
      </div>
      <Sources items={[delivery && pulls.lastOk ? `Mux delivery · daily, 12 h behind · last read ${dateTimeIN(pulls.lastOk.at)}` : 'Mux delivery · not connected', 'Videos and storage · Frrata’s own records, on each visit', `Costs · Frrata’s estimate from Mux’s rates (no bill API), checked ${RATES_CHECKED}`]} />
    </div>
  )
}
