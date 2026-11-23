'use client'

import { useEffect, useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { FIELD } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { IN_KINDS, KIND_WORDS, OUT_KINDS, type CashKind } from '@/domains/admin/cash'
import { Day, Money, Row } from '../../_components/field-parts'
import { booksAction } from '../actions'
import { inputRupees, inrText } from '../format'

// =============================================================================
// FILE: src/app/(admin)/admin/cashflow/_components/fields.tsx — the FIELDS inside Admin › Cashflow's dialogs (mockup § Add an entry, § Update balance). Loaded only when a
// dialog opens (next/dynamic in forms.tsx), so the date picker and the segmented choice stay out of the page's first-load script (Admin's 150 kB budget).
// =============================================================================

export type AcctOption = { id: string; name: string; main: boolean; latestPaise: number | null }
export type EditableEntry = { id: string; amount: string; date: string; planned: boolean; note: string }

const plusYears = (day: string, n: number) => `${Number(day.slice(0, 4)) + n}${day.slice(4)}`
const parsable = /^[-−]?\d[\d,]*(\.\d{1,2})?$/

/** Update balance: the account, what the bank says, its day, the books' figure beside it (main account only), and the floor. */
export function BalanceFields({ accounts, floor, today }: { accounts: AcctOption[]; floor: number | null; today: string }) {
  const first = accounts.find((a) => a.main) ?? accounts[0]
  const [acct, setAcct] = useState(first?.id ?? '')
  const [bal, setBal] = useState(first?.latestPaise != null ? inputRupees(first.latestPaise) : '')
  const [asOf, setAsOf] = useState(today)
  const [books, setBooks] = useState<{ books: number; difference: number } | null>(null)
  const isMain = accounts.find((a) => a.id === acct)?.main ?? false
  useEffect(() => {
    setBooks(null)
    if (!isMain || !parsable.test(bal.trim())) return
    const t = setTimeout(async () => {
      const f = new FormData(); f.set('balance', bal); f.set('asOf', asOf)
      setBooks(await booksAction(f))
    }, 300)
    return () => clearTimeout(t)
  }, [isMain, bal, asOf])
  if (!accounts.length) {
    return (
      <>
        <Row label="Account" name="newAccount"><input name="newAccount" maxLength={60} autoComplete="off" defaultValue="Current account" className={FIELD} data-autofocus="" /></Row>
        <div className="grid gap-3 sm:grid-cols-2"><Money name="balance" label="Balance" autoFocus={false} /><Day label="As of" name="asOf" value={today} today={today} max={today} /></div>
        <Money name="floor" label="Keep at least" placeholder="Optional" />
      </>
    )
  }
  return (
    <>
      <Row label="Account" name="accountId">
        <select name="accountId" value={acct} className={FIELD} onChange={(e) => { setAcct(e.target.value); const a = accounts.find((x) => x.id === e.target.value); setBal(a?.latestPaise != null ? inputRupees(a.latestPaise) : '') }}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Money name="balance" label="Balance" value={bal} onChange={setBal} autoFocus />
        <Day label="As of" name="asOf" value={today} today={today} max={today} onChange={setAsOf} />
      </div>
      {books ? (
        <div className="grid gap-1.5 rounded-lg border border-line-soft p-3 text-sm" aria-live="polite">
          <div className="flex items-center gap-2"><span className="text-muted-foreground">Our books say</span><b className="ml-auto font-num font-semibold">{inrText(books.books)}</b></div>
          <div className="flex items-center gap-2"><span className="text-muted-foreground">Difference</span>
            {books.difference === 0 ? <span className="ml-auto"><Badge tone="ok">Matches</Badge></span> : <b className={`ml-auto font-num font-semibold ${books.difference < 0 ? 'text-danger-text' : ''}`}>{inrText(books.difference, true)}</b>}</div>
        </div>
      ) : null}
      <Money name="floor" label="Keep at least" placeholder="Optional" defaultValue={floor !== null ? inputRupees(floor) : ''} />
    </>
  )
}

/** Add an entry: money in or out, what it was, the amount, an account, whether it has happened yet, the day. */
export function EntryFields({ accounts, today }: { accounts: AcctOption[]; today: string }) {
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const kinds = dir === 'in' ? IN_KINDS : OUT_KINDS
  const [kind, setKind] = useState<CashKind>(IN_KINDS[0]!)
  const [planned, setPlanned] = useState(false)
  const id = useId()
  return (
    <>
      <input type="hidden" name="planned" value={planned ? 'on' : 'off'} />
      <Segmented label="Direction" value={dir} options={[['in', 'Money in'], ['out', 'Money out']]} onPick={(d) => { setDir(d); setKind((d === 'in' ? IN_KINDS : OUT_KINDS)[0]!) }} className="self-start" />
      <Row label="What" name="kind"><select name="kind" value={kind} onChange={(e) => setKind(e.target.value as CashKind)} className={FIELD}>{kinds.map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}</select></Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Money name="amount" label="Amount" />
        <Row label="Account" name="accountId"><select name="accountId" defaultValue="" className={FIELD}><option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Row>
      </div>
      <div className="flex items-center gap-2.5 text-sm"><Switch id={id} on={planned} onChange={setPlanned} /><label htmlFor={id}>{dir === 'in' ? 'Not received yet' : 'Not paid yet'}</label></div>
      <Day key={planned ? 'planned' : 'done'} label={planned ? 'Expected on' : dir === 'in' ? 'Received on' : 'Paid on'} name="date" value={today} today={today} max={planned ? plusYears(today, 2) : today} />
      <Row label="Note" name="note"><input name="note" maxLength={300} autoComplete="off" placeholder="Optional" className={FIELD} /></Row>
    </>
  )
}

/** Edit an entry: the amount, its day and a note. */
export function EditEntryFields({ e, today }: { e: EditableEntry; today: string }) {
  return (
    <>
      <input type="hidden" name="id" value={e.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Money name="amount" label="Amount" defaultValue={e.amount} autoFocus />
        <Day label={e.planned ? 'Expected on' : 'Day'} name={e.planned ? 'expectedOn' : 'happenedOn'} value={e.date} today={today} max={e.planned ? plusYears(today, 2) : today} />
      </div>
      <Row label="Note" name="note"><input name="note" maxLength={300} autoComplete="off" defaultValue={e.note} placeholder="Optional" className={FIELD} /></Row>
    </>
  )
}

export function AccountFields() {
  return <Row label="Name" name="name"><input name="name" maxLength={60} autoComplete="off" className={FIELD} data-autofocus="" /></Row>
}
