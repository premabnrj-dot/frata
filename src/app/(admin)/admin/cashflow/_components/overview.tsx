import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Section } from '@/components/layout/section'
import { Empty } from '@/components/ui/empty'
import type { CashOverview } from '@/lib/admin/cash'
import { NeedsBand } from '../../_components/needs-band'
import { dayText, inrText, monthLongName, monthShortName } from '../format'
import { UpdateBalanceButton } from './forms'

/** The Overview (mockup § Overview, R1): cash now, net each month, the floor, and the six months behind. The forecast, runway and floor band arrive with R2. */
export function Overview({ o }: { o: CashOverview }) {
  const options = o.accounts.map((a) => ({ id: a.id, name: a.name, main: a.main, latestPaise: a.latest?.paise ?? null }))
  if (!o.accounts.length || o.cash === null) {
    return (
      <Empty picto="payments" title="Add your cash in the bank"><UpdateBalanceButton accounts={options} floor={o.floor} today={o.today} /></Empty>
    )
  }
  const shown = o.rows.slice(-6)
  const max = Math.max(1, ...shown.flatMap((r) => [r.billing + r.otherIn, r.costs + r.otherOut]))
  const h = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`
  const label = (i: number) => `${monthShortName(shown[i]!.month)}${i === shown.length - 1 ? '*' : ''}`
  const spoken = (i: number) => (i === shown.length - 1 ? `${monthShortName(shown[i]!.month)}, this month so far` : monthShortName(shown[i]!.month))
  const avg = o.rows.length >= 7 ? `average of ${monthShortName(o.rows[3]!.month)} to ${monthShortName(o.rows[5]!.month)}` : 'average of the last three months'
  return (
    <>
      {o.belowFloor ? <NeedsBand tone="warn" title={`Cash falls below your minimum in ${monthLongName(o.belowFloor)}`} line={o.runwayEnd ? `· it runs out in ${monthLongName(o.runwayEnd)}` : undefined} action={<span className="text-small text-muted-foreground">See the forecast below</span>} /> : null}
      <dl className="grid grid-cols-1 rounded-lg border border-line-soft sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Cash in bank" value={inrText(o.cash)} note={`${o.accounts.length} ${o.accounts.length === 1 ? 'account' : 'accounts'} · ${o.asOf ? dayText(o.asOf) : ''}`} />
        <Figure label="Net each month" value={o.net === null ? '—' : inrText(o.net)} note={avg} tone={o.net !== null && o.net < 0 ? 'bad' : undefined} />
        <Figure label="Cash lasts until" value={o.runwayEnd ? monthLongName(o.runwayEnd) : o.ahead.length ? 'Beyond three years' : '—'} note="at the current pace" tone={o.runwayEnd ? 'bad' : undefined} />
        <Figure label="Keep at least" value={o.floor === null ? 'Not set' : inrText(o.floor)} note="set it in Update balance" />
      </dl>
      <Section title="Last six months" action={<span className="text-small text-muted-foreground">* this month so far</span>} className="space-y-3">
        <div className="grid grid-cols-6 items-end gap-2 sm:gap-3">
          {shown.map((r, i) => {
            const inn = r.billing + r.otherIn, out = r.costs + r.otherOut, net = inn - out
            return (
              <div key={r.month} className="grid gap-1 text-center text-small text-muted-foreground">
                <div className="flex h-28 items-end justify-center gap-1" role="img" aria-label={`${spoken(i)}. Money in ${inrText(inn)}. Money out ${inrText(out)}.`}>
                  <i className="block w-3 rounded-t-sm bg-chart sm:w-5" style={{ height: h(inn) }} /><i className="block w-3 rounded-t-sm bg-warn-mark sm:w-5" style={{ height: h(out) }} />
                </div>
                <b className="font-medium text-foreground">{label(i)}</b>
                <span className={`font-num ${net < 0 ? 'text-danger-text' : net > 0 ? 'text-ok-text' : 'text-muted-foreground'}`}>{inrText(net, true)}</span>
              </div>
            )
          })}
        </div>
        <p className="flex gap-4 text-small text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-chart" />Money in</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-warn-mark" />Money out</span></p>
      </Section>
      {o.ahead.length ? (
        <Section title="Next six months" flush className="space-y-0">
          <DataTable label="Forecast">
            <DataTableHead><th>Month</th><th className="text-right">Money in</th><th className="text-right">Money out</th><th className="text-right">Cash at month end</th></DataTableHead>
            <DataTableBody>
              {o.ahead.slice(0, 6).map((r) => (
                <DataTableRow key={r.month}>
                  <Td cell="a"><span className="font-medium">{monthLongName(r.month)}</span></Td>
                  <Td cell="b" className="text-right font-num">{inrText(r.billing + r.otherIn)}</Td>
                  <Td cell="c" className="text-right font-num">{inrText(r.costs + r.gst + r.otherOut)}</Td>
                  <Td cell="d" className={`text-right font-num ${r.closing < 0 || (o.floor !== null && r.closing < o.floor) ? 'text-danger-text' : ''}`}>{inrText(r.closing)}</Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          {o.unrated ? <p className="px-4 py-3 text-small text-muted-foreground">{o.unrated} {o.unrated === 1 ? 'cost in dollars is' : 'costs in dollars are'} left out until a rate is typed on Costs.</p> : null}
        </Section>
      ) : null}
    </>
  )
}

const Figure = ({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'bad' }) => (
  <div className="grid gap-0.5 border-line-soft p-4 max-sm:[&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l">
    <dt className="text-small font-medium text-muted-foreground">{label}</dt><dd className={`font-num whitespace-nowrap text-title font-semibold ${tone === 'bad' ? 'text-danger-text' : ''}`}>{value}</dd><dd className="text-small text-muted-foreground">{note}</dd>
  </div>
)
