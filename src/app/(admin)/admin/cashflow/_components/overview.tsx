import { Section } from '@/components/layout/section'
import { Tag } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import type { CashOverview } from '@/lib/admin/cash'
import { dayText, inrText, monthShortName } from '../format'
import { UpdateBalanceButton } from './forms'

/** The Overview (mockup § Overview, R1): cash now, net each month, the floor, and the six months behind. The forecast, runway and floor band arrive with R2. */
export function Overview({ o }: { o: CashOverview }) {
  const options = o.accounts.map((a) => ({ id: a.id, name: a.name, main: a.main, latestPaise: a.latest?.paise ?? null }))
  if (!o.accounts.length || o.cash === null) {
    return (
      <Empty picto="payments" title="Add your cash in the bank"><UpdateBalanceButton accounts={options} floor={o.floor} today={o.today} /></Empty>
    )
  }
  const max = Math.max(1, ...o.rows.flatMap((r) => [r.billing + r.otherIn, r.costs + r.otherOut]))
  const h = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`
  const label = (i: number) => `${monthShortName(o.rows[i]!.month)}${i === o.rows.length - 1 ? '*' : ''}`
  return (
    <>
      <dl className="grid grid-cols-1 rounded-lg border border-line-soft sm:grid-cols-3">
        <Figure label="Cash in bank" value={inrText(o.cash)} note={`${o.accounts.length} ${o.accounts.length === 1 ? 'account' : 'accounts'} · ${o.asOf ? dayText(o.asOf) : ''}`} />
        <Figure label="Net each month" value={o.net === null ? '—' : inrText(o.net)} note="average of the last three months" tone={o.net !== null && o.net < 0 ? 'bad' : undefined} />
        <Figure label="Keep at least" value={o.floor === null ? 'Not set' : inrText(o.floor)} note="set it in Update balance" />
      </dl>
      <Section title="Last six months" action={<Tag>* this month so far</Tag>} className="space-y-3">
        <div className="grid grid-cols-7 items-end gap-2 sm:gap-3">
          {o.rows.map((r, i) => {
            const inn = r.billing + r.otherIn, out = r.costs + r.otherOut, net = inn - out
            return (
              <div key={r.month} className="grid gap-1 text-center text-small text-muted-foreground">
                <div className="flex h-28 items-end justify-center gap-1" role="img" aria-label={`${label(i)}. Money in ${inrText(inn)}. Money out ${inrText(out)}.`}>
                  <i className="block w-3 rounded-t-sm bg-chart sm:w-5" style={{ height: h(inn) }} /><i className="block w-3 rounded-t-sm sm:w-5" style={{ height: h(out), background: 'var(--warn-mark)' }} />
                </div>
                <b className="font-medium text-foreground">{label(i)}</b>
                <span className={`font-num ${net < 0 ? 'text-danger-text' : 'text-ok-text'}`}>{inrText(net, true)}</span>
              </div>
            )
          })}
        </div>
        <p className="flex gap-4 text-small text-muted-foreground"><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-chart" />Money in</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: 'var(--warn-mark)' }} />Money out</span></p>
      </Section>
    </>
  )
}

const Figure = ({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'bad' }) => (
  <div className="grid gap-0.5 border-line-soft p-4 max-sm:[&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l">
    <dt className="text-small font-medium text-muted-foreground">{label}</dt><dd className={`font-num text-title font-semibold ${tone === 'bad' ? 'text-danger-text' : ''}`}>{value}</dd><dd className="text-small text-muted-foreground">{note}</dd>
  </div>
)
