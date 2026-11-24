import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Pager } from '@/components/data/pager'
import { NoMatch } from '@/components/ui/empty'
import { CATEGORY_WORDS, fyRange, fyStartOf, type CostCategory } from '@/domains/admin/costs'
import { paise } from '@/domains/money/paise'
import { monthKey, monthRange } from '@/domains/time/month'
import { paymentsPage } from '@/lib/admin/costs'
import type { StaffOk } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { amountText, dayText, monthShortName } from '../format'
import { ChipLink } from '../../_components/chip-link'

/** The Payments tab (mockup § Payments): a month or the financial year, newest first, 50 a page by keyset. */
export async function Payments({ staff, today, sp }: { staff: StaffOk; today: string; sp: { ym?: string; after?: string } }) {
  const months = Array.from({ length: 6 }, (_, i) => monthKey(today, -i))
  const fy = fyStartOf(today)
  const ym = sp.ym === 'fy' ? 'fy' : months.includes(sp.ym ?? '') ? sp.ym! : months[0]!
  const range = ym === 'fy' ? fyRange(fy) : monthRange(ym)
  const m = /^(\d{4}-\d{2}-\d{2})_([0-9a-f-]{36})$/.exec(sp.after ?? '')
  const page = await paymentsPage(staff, { ...range, after: m ? { paidOn: m[1]!, id: m[2]! } : null })
  const here = `/admin/costs?view=payments&ym=${ym}`
  const total = page.rows.reduce((t, r) => t + r.inrPaise, 0)
  return (
    <>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {months.map((x) => <ChipLink key={x} href={`/admin/costs?view=payments&ym=${x}`} current={ym === x}>{monthShortName(x)} {x.slice(0, 4)}</ChipLink>)}
        <ChipLink href="/admin/costs?view=payments&ym=fy" current={ym === 'fy'}>FY {fy}–{String(fy + 1).slice(2)}</ChipLink>
      </nav>
      {page.rows.length === 0 ? <NoMatch title="No payments in this period" /> : (
        <DataTable label="Payments">
          <DataTableHead><th>Cost</th><th>Paid on</th><th>For the bill due</th><th className="text-right">Billed</th><th className="text-right">In rupees</th></DataTableHead>
          <DataTableBody>
            {page.rows.map((p) => (
              <DataTableRow key={p.id}>
                <Td cell="a"><Link href={`/admin/costs?view=all&id=${p.itemId}`} data-row-link className="font-medium hover:underline">{p.name}</Link><span className="block text-small text-muted-foreground">{CATEGORY_WORDS[p.category as CostCategory] ?? p.category}</span></Td>
                <Td cell="b">{dayText(p.paidOn)}</Td>
                <Td cell="c">{dayText(p.periodFor)}</Td>
                <Td cell="d" className="text-right"><Numeric>{amountText(p.amount, p.currency)}</Numeric></Td>
                <Td cell="e" className="text-right"><Money paise={paise(p.inrPaise)} /></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {page.rows.length > 0 ? <Pager first={1} shown={page.rows.length} total={page.next ? `${page.rows.length}+` : page.rows.length}
        {...(sp.after ? { prevHref: here } : {})} {...(page.next ? { nextHref: `${here}&after=${page.next.paidOn}_${page.next.id}` } : {})} /> : null}
      {page.rows.length > 0 && !page.next && !sp.after ? <p className="text-sm text-muted-foreground">{page.rows.length} {page.rows.length === 1 ? 'payment' : 'payments'} · <Numeric>{formatInr(paise(total))}</Numeric></p> : null}
    </>
  )
}
