import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import type { Alert } from '@/domains/infra/alerts'
import { RATES_CHECKED, VERCEL } from '@/domains/infra/rates'
import { RULES, type VercelFacts } from '@/domains/infra/vercel'
import type { MicroUsd } from '@/domains/money/usd'
import type { Pull } from '@/lib/admin/infra'
import { formatUsd } from '@/lib/format'
import { dateTimeIN } from '@/lib/format-date'
import { Kpis, Meter, NeedsYou, Rules, Sources } from './parts'

export const PULL_WHY: Record<string, string> = {
  not_connected: 'No billing token yet', token_too_wide: 'The token can do more than read billing, so it was refused',
  refused: 'Vercel refused the token', unavailable: 'Vercel didn’t answer', too_large: 'Vercel’s reply was too large',
}

export function VercelTab({ f, alerts, pulls, connected }: { f: VercelFacts; alerts: Alert[]; pulls: { last: Pull | null; lastOk: Pull | null }; connected: boolean }) {
  if (!connected && !pulls.lastOk) return <Panel title="Vercel’s numbers arrive with its billing read">A billing-only Vercel token connects this tab. Vercel’s own spend alerts by email and SMS hold until then.</Panel>
  if (!pulls.lastOk) return <Panel title="Vercel’s billing hasn’t been read yet">{pulls.last?.why ? PULL_WHY[pulls.last.why] ?? 'The last read didn’t work' : 'The first read runs within the hour'}.</Panel>
  const credit = (VERCEL.creditUsd * 1e6) as MicroUsd
  const pace = f.budgetMicros ? f.projectedOnDemandMicros / f.budgetMicros : 0
  const max = Math.max(1, ...f.daily.map((d) => d.micros))
  return (
    <div className="grid gap-4">
      {pulls.last && !pulls.last.ok ? (
        <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">Last read {dateTimeIN(pulls.lastOk.at)} · {PULL_WHY[pulls.last.why ?? ''] ?? 'the latest read didn’t work'}</p>
      ) : null}
      <Kpis items={[
        { label: 'Month to date', value: formatUsd(f.usageMicros), sub: `Day ${f.dayOfMonth} of ${f.daysInMonth} · before the $${VERCEL.creditUsd} credit` },
        { label: 'On pace for', value: formatUsd(f.projectedMicros), sub: `Budget ${formatUsd(f.budgetMicros)} past the credit · as set in Vercel` },
        { label: 'Past the credit', value: formatUsd(f.onDemandMicros), sub: f.onDemandMicros ? 'Billed on demand' : 'The credit covers it' },
        { label: 'Active CPU', value: `${f.cpuHours} h`, sub: 'This month, every project' },
      ]} />
      <NeedsYou alerts={alerts} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="This month">
          <div className="grid gap-3">
            <Meter label="Usage credit" value={`${formatUsd(Math.min(f.usageMicros, credit) as MicroUsd)} / ${formatUsd(credit)}`} share={f.usageMicros / credit} tone={f.usageMicros >= credit ? 'warn' : 'neutral'} />
            <Meter label="Budget on pace" value={`${formatUsd(f.projectedOnDemandMicros)} / ${formatUsd(f.budgetMicros)}`} share={pace} tone={pace > 1 ? 'danger' : pace > 0.75 ? 'warn' : 'neutral'} />
          </div>
        </Section>
        <Section title="Last 30 days">
          <div role="img" aria-label="Cost a day, last 30 days" className="flex h-32 items-end gap-0.5">
            {f.daily.map((d) => <span key={d.day} title={`${d.day} · ${formatUsd(d.micros)}`} className="min-w-0 flex-1 rounded-t-sm bg-foreground" style={{ height: `${Math.max(2, d.micros / max * 100)}%` }} />)}
          </div>
          <p className="flex justify-between text-xs text-muted-foreground"><span>{f.daily[0]?.day ?? ''}</span><span>{f.lastDay ?? ''}</span></p>
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section flush title="By project">
          <DataTable label="By project">
            <DataTableHead><th>Project</th><th className="text-right">Cost</th><th className="text-right">Share</th></DataTableHead>
            <DataTableBody>
              {f.byProject.slice(0, 8).map((p) => <DataTableRow key={p.project}><Td cell="a">{p.project}{p.project === RULES.ourProject ? <span className="ml-2 text-xs text-muted-foreground">Frrata</span> : null}</Td><Td cell="b" className="text-right font-mono tabular-nums">{formatUsd(p.micros)}</Td><Td cell="c" className="text-right font-mono tabular-nums">{Math.round(p.share * 100)}%</Td></DataTableRow>)}
            </DataTableBody>
          </DataTable>
        </Section>
        <Section flush title="By service">
          <DataTable label="By service">
            <DataTableHead><th>Service</th><th className="text-right">Cost</th></DataTableHead>
            <DataTableBody>
              {f.byService.filter((s) => s.micros > 0).slice(0, 8).map((s) => <DataTableRow key={s.service}><Td cell="a">{s.service}</Td><Td cell="b" className="text-right font-mono tabular-nums">{formatUsd(s.micros)}</Td></DataTableRow>)}
            </DataTableBody>
          </DataTable>
        </Section>
      </div>
      <Rules rules={[
        ['On pace past the budget', `Projected past the credit over ${formatUsd(f.budgetMicros)}; three quarters used is Now`],
        ['A day over 3× normal', 'A finished day against the 7 days before'],
        ['Another project over 40%', 'It shares Frrata’s budget and its pause'],
        ['Vercel’s own spend alert', 'Email and SMS from Vercel at 50%, 75% and 100% of the budget'],
      ]} />
      <Sources items={[`Vercel billing · daily · last read ${dateTimeIN(pulls.lastOk.at)}`, `Rates · checked ${RATES_CHECKED}`]} />
    </div>
  )
}
