// THE CHROME EVERY TABLE SHARES — frame, header band, row rule, hover (from Ekatan).
// It shares the chrome, NOT the columns: each table writes its own cells.
//
// ON A PHONE (< 768 px) A TABLE BECOMES ROWS (frata-design-language § UX foundation rule 15): one DOM, reflowed
// by CSS in globals.css ([data-rows]). Each <Td> says where it goes: `a` the link (number or name) and `b` the
// figure on line 1 (the link carries prefetch={false}: a page of rows must not prefetch every record);
// `c` who/where and `d` the badges on line 2; `e`, `f` full-width lines below; `hide` is
// desktop-only. The row's link (data-row-link) makes the whole row one target. Explicit roles keep the table a
// table for a screen reader when its display changes. `form` rows (an editor grid) become a card of labelled
// fields instead: every <Td label> shows its column name above its field on a phone.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, type TdHTMLAttributes } from 'react'

export type CellSlot = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'hide' | 'full'

export function DataTable({ children, rows = 'list', label }: { children: ReactNode; rows?: 'list' | 'form'; label?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
      <table data-rows={rows} role="table" aria-label={label} className="w-full text-sm">{children}</table>
    </div>
  )
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead role="rowgroup" className="border-b border-border bg-sunk text-left">
      {/* Neel § Components: a 36 px sunk header, 12/16 labels in text 2; rows 48 px, the soft rule, hover g25, selected neel 50. */}
      <tr role="row" className="text-small font-medium text-muted-foreground md:[&>th]:h-9 [&>th]:px-3 [&>th]:font-medium [&>th]:py-1">
        {/* Each header cell says it is one, so WebKit keeps reading headers when a phone reflows the table. */}
        {Children.map(children, (c) => isValidElement(c) && c.type === 'th' ? cloneElement(c as ReactElement<{ role?: string }>, { role: 'columnheader' }) : c)}
      </tr>
    </thead>
  )
}

/** The rows: a rowgroup by role, for the same reason. */
export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody role="rowgroup">{children}</tbody>
}

/** `dimmed`: a finished row (cancelled, returned) in the secondary text colour, which keeps 4.5:1. Never opacity (rule 4).
 * `selected`: a row picked for a bulk action (neel 50). */
export function DataTableRow({ children, dimmed = false, selected = false, tall = false }: { children: ReactNode; dimmed?: boolean; selected?: boolean
  /** A row with a photo or a two-line cell: 56 px (Neel § Layout · Density). */
  tall?: boolean }) {
  return (
    <tr role="row" data-selected={selected || undefined} className={`border-b border-line-soft last:border-0 ${tall ? 'md:[&>td]:h-14' : 'md:[&>td]:h-12'} [&>td]:px-3 [&>td]:py-1.5 ${selected ? 'bg-select' : 'hover:bg-side'} ${dimmed ? 'text-muted-foreground' : ''}`}>
      {children}
    </tr>
  )
}

/** A cell: where it goes on a phone (`cell`), and the column's name shown beside it there (`label`, form rows). */
export function Td({ cell, label, children, ...rest }: { cell?: CellSlot; label?: string; children?: ReactNode } & TdHTMLAttributes<HTMLTableCellElement>) {
  return <td role="cell" data-cell={cell} data-label={label} {...rest}>{children}</td>
}
