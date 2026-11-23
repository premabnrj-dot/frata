import { Section } from '@/components/layout/section'
import { Empty } from '@/components/ui/empty'
import { Tag } from '@/components/ui/badge'
import type { CashOverview } from '@/lib/admin/cash'
import { dayText, inrText } from '../format'
import { UndoBalanceButton } from './forms'

/** The Accounts tab (mockup § Accounts): each account's latest balance and the two before it; the main account tagged. */
export function AccountsView({ o }: { o: CashOverview }) {
  const total = o.accounts.reduce((t, a) => t + (a.latest?.paise ?? 0), 0)
  if (!o.accounts.length) return <Empty picto="payments" title="No accounts yet" />
  return (
    <Section flush title="Accounts" className="space-y-0">
      <ul className="divide-y divide-line-soft">
        {o.accounts.map((a) => (
          <li key={a.id} className="grid gap-0.5 px-4 py-3 md:px-5">
            <div className="flex items-center gap-2"><b className="font-medium">{a.name}</b>{a.main ? <Tag>Main</Tag> : null}<span className="ml-auto font-num font-semibold">{a.latest ? inrText(a.latest.paise) : '—'}</span>{a.latest ? <UndoBalanceButton accountId={a.id} balanceId={a.latest.id} name={a.name} /> : null}</div>
            <span className="text-small text-muted-foreground">{a.latest ? `As of ${dayText(a.latest.asOf)}` : 'No balance yet'}{a.earlier.map((b) => <span key={b.id}> · <span className="font-num">{inrText(b.paise)}</span> on {dayText(b.asOf)}</span>)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 bg-sunk px-4 py-3 md:px-5"><b className="font-medium">Total</b><span className="ml-auto font-num font-semibold">{inrText(total)}</span></li>
      </ul>
    </Section>
  )
}
