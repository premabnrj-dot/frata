import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Tag } from '@/components/ui/badge'
import { NoMatch } from '@/components/ui/empty'
import { KIND_WORDS, type CashKind } from '@/domains/admin/cash'
import { monthKey } from '@/domains/time/month'
import type { Line, Movements } from '@/lib/admin/cash'
import { ChipLink } from '../../_components/chip-link'
import { dayText, inrText, monthShortName } from '../format'
import { EntryMore, MarkReceivedButton } from './forms'

const KINDS = [['all', 'All'], ['in', 'In'], ['out', 'Out'], ['entered', 'Entered']] as const
type KindKey = (typeof KINDS)[number][0]
const pass = (l: Line, k: KindKey) => k === 'all' ? true : k === 'in' ? l.amount > 0 : k === 'out' ? l.amount < 0 : l.source === 'Entered' || l.source === 'Planned'

/** The Movements tab (mockup § Movements): a month, every line from its source, In, Out and Entered filters. */
export function MovementsView({ mv, today, kind }: { mv: Movements; today: string; kind: KindKey }) {
  const months = Array.from({ length: 6 }, (_, i) => monthKey(today, -i))
  const shown = mv.lines.filter((l) => pass(l, kind))
  const href = (m: string, k: KindKey) => `/admin/cashflow?view=movements&ym=${m}${k === 'all' ? '' : `&kind=${k}`}`
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Month" className="flex flex-wrap gap-1.5">{months.map((m) => <ChipLink key={m} href={href(m, kind)} current={m === mv.month}>{monthShortName(m)} {m.slice(0, 4)}</ChipLink>)}</nav>
        <nav aria-label="Direction" className="ml-auto flex flex-wrap gap-1.5">{KINDS.map(([k, l]) => <ChipLink key={k} href={href(mv.month, k)} current={kind === k}>{l}</ChipLink>)}</nav>
      </div>
      <dl className="grid grid-cols-3 rounded-lg border border-line-soft">
        <div className="grid gap-0.5 p-4"><dt className="text-small font-medium text-muted-foreground">In</dt><dd className="font-num text-title font-semibold text-ok-text">{inrText(mv.in)}</dd></div>
        <div className="grid gap-0.5 border-l border-line-soft p-4"><dt className="text-small font-medium text-muted-foreground">Out</dt><dd className="font-num text-title font-semibold">{inrText(-mv.out)}</dd></div>
        <div className="grid gap-0.5 border-l border-line-soft p-4"><dt className="text-small font-medium text-muted-foreground">Net</dt><dd className={`font-num text-title font-semibold ${mv.in - mv.out < 0 ? 'text-danger-text' : ''}`}>{inrText(mv.in - mv.out, true)}</dd></div>
      </dl>
      {shown.length === 0 ? <NoMatch title="No money moved here" /> : (
        <DataTable label="Movements">
          <DataTableHead><th>What</th><th>Day</th><th>From</th><th className="text-right">Amount</th><th><span className="sr-only">Actions</span></th></DataTableHead>
          <DataTableBody>
            {shown.map((l) => {
              const entry = l.entryId !== null
              const name = entry ? KIND_WORDS[l.name as CashKind] ?? l.name : l.name
              return (
                <DataTableRow key={l.key} dimmed={l.source === 'Planned'}>
                  <Td cell="a">{l.href ? <Link href={l.href} data-row-link className="font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>}
                    {l.sub ? <span className="block text-small text-muted-foreground">{l.sub}</span> : null}</Td>
                  <Td cell="b">{dayText(l.date)}</Td>
                  <Td cell="c"><Tag>{l.source}</Tag></Td>
                  <Td cell="d" className={`text-right font-num ${l.amount > 0 ? 'text-ok-text' : ''}`}>{inrText(l.amount, true)}</Td>
                  <Td cell="f" className="text-right">{entry ? (
                    <span className="inline-flex items-center gap-1">
                      {l.source === 'Planned' ? <MarkReceivedButton id={l.entryId!} expectedOn={l.date} outgoing={l.amount < 0} /> : null}
                      <EntryMore today={today} e={{ id: l.entryId!, name, amount: String(Math.abs(l.amount) / 100), date: l.date, planned: l.source === 'Planned', note: l.sub ?? '' }} />
                    </span>
                  ) : null}</Td>
                </DataTableRow>
              )
            })}
          </DataTableBody>
        </DataTable>
      )}
      {mv.more ? <p className="text-sm text-muted-foreground">There are more lines than shown. Pick a shorter month or filter.</p> : null}
    </>
  )
}
