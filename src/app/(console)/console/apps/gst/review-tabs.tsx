'use client'

import { useState } from 'react'
import type { Gstr1 } from '@/domains/tax/gstr1'

const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: p % 100 ? 2 : 0 })}`
const dmy = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const pc = (bps: number) => `${bps / 100}%`

/** Review (approved mockup "Review"): GSTR-1's tables in the merchant's words, the portal's names beside them. */
export function ReviewTabs({ gstr }: { gstr: Gstr1 }) {
  const tabs = [
    ['b2cs', 'Other sales', 'B2CS', gstr.b2cs.length], ['b2b', 'Business sales', 'B2B', gstr.b2b.length], ['b2cl', 'Large inter-state', 'B2CL', gstr.b2cl.length],
    ['cdn', 'Credit notes', 'CDNR · CDNUR', gstr.cdnr.length + gstr.cdnur.length], ['hsn', 'HSN summary', 'B2B · B2C', gstr.hsn.b2b.length + gstr.hsn.b2c.length], ['docs', 'Documents issued', 'Table 13', gstr.docs.length],
  ] as const
  const [t, setT] = useState<(typeof tabs)[number][0]>('b2cs')
  const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground', td = 'px-3 py-2', r = 'text-right tabular-nums'
  const heads = (x: { taxable: number; igst: number; cgst: number; sgst: number }) => <><td className={`${td} ${r}`}>{rs(x.taxable)}</td><td className={`${td} ${r}`}>{x.igst ? rs(x.igst) : '—'}</td><td className={`${td} ${r}`}>{x.cgst ? rs(x.cgst) : '—'}</td><td className={`${td} ${r}`}>{x.sgst ? rs(x.sgst) : '—'}</td></>
  const H = <><th className={`${th} ${r}`}>Taxable value</th><th className={`${th} ${r}`}>IGST</th><th className={`${th} ${r}`}>CGST</th><th className={`${th} ${r}`}>SGST</th></>
  const empty = (cols: number) => <tr><td colSpan={cols} className="px-3 py-6 text-center text-sm text-muted-foreground">None this period.</td></tr>
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div role="tablist" aria-label="GSTR-1 tables" className="flex gap-1 overflow-x-auto border-b border-border [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
        {tabs.map(([k, l, code, n]) => (
          <button key={k} role="tab" aria-selected={t === k} onClick={() => setT(k)} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t === k ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground'}`}>
            {l}<small className="text-xs font-normal text-muted-foreground">{code} · {n}</small>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto" role="tabpanel">
        <table className="w-full min-w-[620px] text-sm">
          {t === 'b2cs' && <><thead className="bg-muted"><tr><th className={th}>Place of supply</th><th className={`${th} ${r}`}>Rate</th>{H}</tr></thead>
            <tbody className="divide-y divide-border">{gstr.b2cs.length ? gstr.b2cs.map((x) => <tr key={`${x.pos}${x.rate}${x.supply}`}><td className={td}>{x.pos} · {x.supply === 'intra' ? 'within state' : 'other state'}</td><td className={`${td} ${r}`}>{pc(x.rate)}</td>{heads(x)}</tr>) : empty(6)}</tbody></>}
          {t === 'b2b' && <><thead className="bg-muted"><tr><th className={th}>Buyer</th><th className={th}>GSTIN</th><th className={th}>Invoice</th><th className={`${th} ${r}`}>Value</th><th className={`${th} ${r}`}>Tax</th></tr></thead>
            <tbody className="divide-y divide-border">{gstr.b2b.length ? gstr.b2b.map((x) => <tr key={x.number}><td className={td}>{x.name}</td><td className={`${td} font-mono text-xs`}>{x.gstin}</td><td className={`${td} font-mono text-xs`}>{x.number}</td><td className={`${td} ${r}`}>{rs(x.value)}</td><td className={`${td} ${r}`}>{rs(x.rates.reduce((a, y) => a + y.igst + y.cgst + y.sgst, 0))}</td></tr>) : empty(5)}</tbody></>}
          {t === 'b2cl' && <><thead className="bg-muted"><tr><th className={th}>Invoice</th><th className={th}>Date</th><th className={th}>Place of supply</th><th className={`${th} ${r}`}>Value</th><th className={`${th} ${r}`}>IGST</th></tr></thead>
            <tbody className="divide-y divide-border">{gstr.b2cl.length ? gstr.b2cl.map((x) => <tr key={x.number}><td className={`${td} font-num text-xs`}>{x.number}</td><td className={td}>{dmy(x.date)}</td><td className={td}>{x.pos}</td><td className={`${td} ${r}`}>{rs(x.value)}</td><td className={`${td} ${r}`}>{rs(x.rates.reduce((a, y) => a + y.igst, 0))}</td></tr>) : empty(5)}</tbody></>}
          {t === 'cdn' && <><thead className="bg-muted"><tr><th className={th}>Credit note</th><th className={th}>Against</th><th className={th}>To</th><th className={`${th} ${r}`}>Value</th></tr></thead>
            <tbody className="divide-y divide-border">{gstr.cdnr.length + gstr.cdnur.length ? [...gstr.cdnr, ...gstr.cdnur].map((x) => <tr key={x.number}><td className={`${td} font-num text-xs`}>{x.number}</td><td className={`${td} font-num text-xs`}>{x.against}</td><td className={td}>{x.gstin ?? 'Unregistered (B2CL)'}</td><td className={`${td} ${r}`}>{rs(x.value)}</td></tr>) : empty(4)}</tbody></>}
          {t === 'hsn' && <><thead className="bg-muted"><tr><th className={th}>Table</th><th className={th}>HSN</th><th className={th}>Unit</th><th className={`${th} ${r}`}>Qty</th><th className={`${th} ${r}`}>Rate</th>{H}</tr></thead>
            <tbody className="divide-y divide-border">{gstr.hsn.b2b.length + gstr.hsn.b2c.length ? [...gstr.hsn.b2b.map((x) => ['B2B', x] as const), ...gstr.hsn.b2c.map((x) => ['B2C', x] as const)].map(([k, x]) => <tr key={`${k}${x.hsn}${x.rate}${x.uqc}`}><td className={td}>{k}</td><td className={`${td} font-mono`}>{x.hsn || '—'}</td><td className={`${td} font-mono text-xs`}>{x.uqc}</td><td className={`${td} ${r}`}>{x.qty}</td><td className={`${td} ${r}`}>{pc(x.rate)}</td>{heads(x)}</tr>) : empty(9)}</tbody></>}
          {t === 'docs' && <><thead className="bg-muted"><tr><th className={th}>Documents</th><th className={th}>From</th><th className={th}>To</th><th className={`${th} ${r}`}>Total</th><th className={`${th} ${r}`}>Cancelled</th></tr></thead>
            <tbody className="divide-y divide-border">{gstr.docs.length ? gstr.docs.map((x) => <tr key={x.kind}><td className={td}>{x.kind === 'invoices' ? 'Invoices' : 'Credit notes'}</td><td className={`${td} font-num text-xs`}>{x.from}</td><td className={`${td} font-num text-xs`}>{x.to}</td><td className={`${td} ${r}`}>{x.total}</td><td className={`${td} ${r}`}>{x.cancelled}</td></tr>) : empty(5)}</tbody></>}
        </table>
      </div>
    </div>
  )
}
