'use client'

import { Plus, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { placeUnder } from '@/components/ui/anchor'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { ordersHref, parseFilters, PAY, PAY_WORDS, PLACED, type OrderFilters, type Pay } from '@/domains/orders/filters'
import type { QueueTab } from '@/domains/orders/order-state'
import type { State } from '@/domains/checkout/states'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/filter-panel.tsx — "+ FILTER" AND THE PHONE'S FILTERS (Neel N1c).
//
// The fields on the left, a field's values on the right with how many orders each has (../filter-values, inside the
// tab and the other filters; no counts when they could not be read). Ranges for Placed and Total. "Show 25 orders"
// counts what applying would show before the person looks (../rows?count=1, 300 ms after the last change); Apply
// goes to the address with the filters, so Back undoes it. The same panel is the desktop popover and the phone's sheet.
// =============================================================================

type Field = 'pay' | 'st' | 'placed' | 'total'
const FIELDS: { key: Field; label: string }[] = [{ key: 'pay', label: 'Payment' }, { key: 'st', label: 'State' }, { key: 'placed', label: 'Placed' }, { key: 'total', label: 'Total' }]
const PLACED_LABEL = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' } as const

type Ask = { tab: QueueTab; q: string; filters: string }
// The address the panel asks with and goes to: the list's own (ordersHref), its query string for the routes.
const query = (a: Ask, f: OrderFilters, extra: Record<string, string> = {}) => ordersHref({ tab: a.tab, filters: f, q: a.q }, extra).split('?')[1] ?? ''

function Panel({ ask, start, onClose, sheet = false }: { ask: Ask; start: Field; onClose: () => void; sheet?: boolean }) {
  const router = useRouter()
  const [field, setField] = useState<Field>(start)
  const [draft, setDraft] = useState<OrderFilters>(() => parseFilters(Object.fromEntries(new URLSearchParams(ask.filters))))
  const [values, setValues] = useState<Partial<Record<'pay' | 'st', { value: string; n: number }[] | null>>>({})
  const [count, setCount] = useState<number | null>(null)

  // A field's values, once per opening (inside the tab and the other filters as they were when the panel opened).
  // The sheet shows every field at once, so it asks for both lists when it opens.
  useEffect(() => {
    const want = (sheet ? ['pay', 'st'] as const : field === 'pay' || field === 'st' ? [field] : []).filter((f) => !(f in values))
    if (!want.length) return
    const ctl = new AbortController()
    for (const f of want) {
      fetch(`/console/orders/filter-values?${query(ask, parseFilters(Object.fromEntries(new URLSearchParams(ask.filters))), { field: f })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { values: null })).then((b: { values: { value: string; n: number }[] | null }) => setValues((v) => ({ ...v, [f]: b.values })))
        .catch(() => { if (!ctl.signal.aborted) setValues((v) => ({ ...v, [f]: null })) })
    }
    return () => ctl.abort()
  }, [field]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Show N orders": counted 300 ms after the last change.
  useEffect(() => {
    const ctl = new AbortController()
    setCount(null)
    const t = setTimeout(() => {
      fetch(`/console/orders/rows?${query(ask, draft, { count: '1' })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null)).then((b: { count: number } | null) => setCount(b?.count ?? null)).catch(() => {})
    }, 300)
    return () => { clearTimeout(t); ctl.abort() }
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = <T extends string>(list: T[] | undefined, v: T) => { const s = new Set(list ?? []); if (s.has(v)) s.delete(v); else s.add(v); return [...s] }
  const apply = () => { onClose(); router.push(ordersHref({ tab: ask.tab, filters: draft, q: ask.q }), { scroll: false }) }
  const counted = (k: 'pay' | 'st', v: string) => values[k]?.find((x) => x.value === v)?.n
  const range = typeof draft.placed === 'object' ? draft.placed : {}
  const row = 'flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent md:min-h-9'

  const showLabel = count === null ? 'Show orders' : `Show ${count.toLocaleString('en-IN')} order${count === 1 ? '' : 's'}`
  const setPlaced = (p: OrderFilters['placed']) => setDraft((d) => { const n = { ...d, placed: p }; if (!p) delete n.placed; return n })
  const setTotal = (k: 'min' | 'max', raw: string) => {
    const v = raw === '' ? undefined : Math.max(0, Math.round(Number(raw))) * 100
    setDraft((d) => { const t = { ...d.total, [k]: v }; if (t[k] === undefined) delete t[k]; return { ...d, total: Object.keys(t).length ? t : undefined } })
  }
  const loading = <p role="status" className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>
  const noStates = (v: null | []) => <p className="px-2 py-2 text-sm text-muted-foreground">{v === null ? 'Could not count by state just now.' : 'No orders here have a state.'}</p>
  const totalFields = (
    <div className="grid grid-cols-2 gap-2">
      {(['min', 'max'] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1 text-label text-muted-foreground">{k === 'min' ? 'From, ₹' : 'To, ₹'}
          <input type="number" inputMode="numeric" min={0} step={1} className={FIELD} value={draft.total?.[k] !== undefined ? draft.total[k]! / 100 : ''} onChange={(e) => setTotal(k, e.target.value)} />
        </label>
      ))}
    </div>
  )

  // THE PHONE'S SHEET, as drawn (§ Finding · Filters on a phone): every field stacked, its values as pill toggles,
  // "Clear all" at the top, one full-width "Show N orders" at the foot.
  if (sheet) {
    const pill = (on: boolean) => cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm', on ? 'border-primary bg-select font-medium text-link' : 'border-border bg-card')
    const section = 'flex flex-col gap-2 border-b border-line-soft py-3.5 last:border-0'
    return (
      <div className="flex flex-col">
        <div className="flex justify-end"><button type="button" onClick={() => setDraft({})} className={cn(button({ variant: 'link' }), 'min-h-11')}>Clear all</button></div>
        <fieldset className={section}><legend className="mb-2 text-label font-medium">Payment</legend>
          <div className="flex flex-wrap gap-2">{PAY.map((p) => (
            <button key={p} type="button" aria-pressed={!!draft.pay?.includes(p)} onClick={() => setDraft((d) => ({ ...d, pay: toggle<Pay>(d.pay, p) }))} className={pill(!!draft.pay?.includes(p))}>
              {PAY_WORDS[p]}{counted('pay', p) !== undefined ? <span className="font-num text-small text-muted-foreground">{counted('pay', p)}</span> : null}</button>
          ))}</div>
        </fieldset>
        <fieldset className={section}><legend className="mb-2 text-label font-medium">State</legend>
          {values.st === undefined ? loading : !values.st?.length ? noStates(values.st as null | []) : (
            <div className="flex flex-wrap gap-2">{values.st.slice(0, 12).map((v) => (
              <button key={v.value} type="button" aria-pressed={!!draft.states?.includes(v.value as State)} onClick={() => setDraft((d) => ({ ...d, states: toggle<State>(d.states, v.value as State) }))} className={pill(!!draft.states?.includes(v.value as State))}>
                {v.value}<span className="font-num text-small text-muted-foreground">{v.n}</span></button>
            ))}</div>)}
        </fieldset>
        <fieldset className={section}><legend className="mb-2 text-label font-medium">Placed</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!draft.placed} onClick={() => setPlaced(undefined)} className={pill(!draft.placed)}>Any time</button>
            {PLACED.map((p) => <button key={p} type="button" aria-pressed={draft.placed === p} onClick={() => setPlaced(p)} className={pill(draft.placed === p)}>{PLACED_LABEL[p]}</button>)}
          </div>
        </fieldset>
        <fieldset className={section}><legend className="mb-2 text-label font-medium">Total, ₹</legend>{totalFields}</fieldset>
        <Button type="button" size="lg" className="mt-3 w-full" onClick={apply}>{showLabel}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 md:min-h-56">
        <ul aria-label="Filter by" className="flex flex-col gap-0.5 border-r border-line-soft pr-2">
          {FIELDS.map((f) => (
            <li key={f.key}><button type="button" data-field={f.key} aria-current={field === f.key ? 'true' : undefined} onClick={() => setField(f.key)}
              className={cn('flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-sm md:min-h-9', field === f.key ? 'bg-select font-medium text-link' : 'hover:bg-accent')}>{f.label}</button></li>
          ))}
        </ul>
        <fieldset className="min-w-0">
          <legend className="sr-only">{FIELDS.find((f) => f.key === field)!.label}</legend>
          {field === 'pay' && PAY.map((p) => (
            <label key={p} className={row}><input type="checkbox" checked={!!draft.pay?.includes(p)} onChange={() => setDraft((d) => ({ ...d, pay: toggle<Pay>(d.pay, p) }))} />
              <span className="flex-1">{PAY_WORDS[p]}</span>{counted('pay', p) !== undefined ? <span className="font-num text-label text-muted-foreground tabular-nums">{counted('pay', p)}</span> : null}</label>
          ))}
          {field === 'st' && (values.st === undefined ? loading : !values.st?.length ? noStates(values.st as null | [])
            : <div className="max-h-64 overflow-y-auto">{values.st.map((v) => (
              <label key={v.value} className={row}><input type="checkbox" checked={!!draft.states?.includes(v.value as State)} onChange={() => setDraft((d) => ({ ...d, states: toggle<State>(d.states, v.value as State) }))} />
                <span className="flex-1">{v.value}</span><span className="font-num text-label text-muted-foreground tabular-nums">{v.n}</span></label>
            ))}</div>)}
          {field === 'placed' && (
            <div className="flex flex-col gap-1">
              <label className={row}><input type="radio" name="placed" checked={!draft.placed} onChange={() => setPlaced(undefined)} />Any time</label>
              {PLACED.map((p) => (
                <label key={p} className={row}><input type="radio" name="placed" checked={draft.placed === p} onChange={() => setPlaced(p)} />{PLACED_LABEL[p]}</label>
              ))}
              <div className="mt-1 grid grid-cols-2 gap-2 px-2">
                <label className="flex flex-col gap-1 text-label text-muted-foreground">From<input type="date" className={FIELD} value={range.from ?? ''} onChange={(e) => setPlaced({ ...range, from: e.target.value || undefined })} /></label>
                <label className="flex flex-col gap-1 text-label text-muted-foreground">To<input type="date" className={FIELD} value={range.to ?? ''} onChange={(e) => setPlaced({ ...range, to: e.target.value || undefined })} /></label>
              </div>
            </div>
          )}
          {field === 'total' && <div className="px-2">{totalFields}</div>}
        </fieldset>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-line-soft pt-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={apply}>{showLabel}</Button>
      </div>
    </div>
  )
}

/** "+ Filter" on a desktop: a popover beside the chips. */
export function AddFilter({ ask }: { ask: Ask }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const wasInside = useRef(false)
  return (
    <>
      <button ref={trigger} type="button" popoverTarget={id} aria-expanded={open} aria-controls={id}
        className={cn(button({ variant: 'ghost', size: 'sm' }), 'hidden gap-1 text-link md:inline-flex')}><Plus aria-hidden="true" className="size-4" />Filter</button>
      <div ref={pop} id={id} popover="auto" role="dialog" aria-label="Filter orders" className="w-[460px] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
        // Focus goes to the open field on open; on close it returns to "+ Filter" only if it was inside (a click on the
        // search box or a row keeps its own focus).
        onBeforeToggle={(e) => { if ((e as unknown as ToggleEvent).newState === 'closed') wasInside.current = !!pop.current?.contains(document.activeElement) }}
        onToggle={(e) => {
          const isOpen = (e as unknown as ToggleEvent).newState === 'open'
          setOpen(isOpen)
          if (isOpen && trigger.current) { placeUnder(trigger.current, e.currentTarget, 'start'); requestAnimationFrame(() => pop.current?.querySelector<HTMLElement>('[data-field][aria-current]')?.focus()) }
          else if (wasInside.current) trigger.current?.focus()
        }}>
        {open ? <Panel ask={ask} start="pay" onClose={() => pop.current?.hidePopover()} /> : null}
      </div>
    </>
  )
}

/** The phone's "Filters": a sheet from the bottom with the same panel; its count in the button. */
export function FilterSheet({ ask, active }: { ask: Ask; active: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(button({ variant: 'secondary' }), 'md:hidden')}>
        <SlidersHorizontal aria-hidden="true" className="size-4" />Filters{active ? <Badge tone="info">{active}</Badge> : null}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filters" actions={null}>
        {open ? <Panel ask={ask} start="pay" sheet onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}
