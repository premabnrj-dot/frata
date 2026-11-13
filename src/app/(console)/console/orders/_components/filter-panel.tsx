'use client'

import { Plus, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { placeUnder } from '@/components/ui/anchor'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { filterParams, parseFilters, PAY, PAY_WORDS, PLACED, type OrderFilters, type Pay } from '@/domains/orders/filters'
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
const query = (a: Ask, f: OrderFilters, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams(filterParams(f))
  if (a.tab !== 'to_confirm') u.set('tab', a.tab)
  if (a.q) u.set('q', a.q)
  for (const [k, v] of Object.entries(extra)) u.set(k, v)
  return u.toString()
}

function Panel({ ask, start, onClose }: { ask: Ask; start: Field; onClose: () => void }) {
  const router = useRouter()
  const [field, setField] = useState<Field>(start)
  const [draft, setDraft] = useState<OrderFilters>(() => parseFilters(Object.fromEntries(new URLSearchParams(ask.filters))))
  const [values, setValues] = useState<Partial<Record<'pay' | 'st', { value: string; n: number }[] | null>>>({})
  const [count, setCount] = useState<number | null>(null)

  // A field's values, once per opening (inside the tab and the other filters as they were when the panel opened).
  useEffect(() => {
    if ((field !== 'pay' && field !== 'st') || field in values) return
    const ctl = new AbortController()
    fetch(`/console/orders/filter-values?${query(ask, parseFilters(Object.fromEntries(new URLSearchParams(ask.filters))), { field })}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { values: null })).then((b: { values: { value: string; n: number }[] | null }) => setValues((v) => ({ ...v, [field]: b.values })))
      .catch(() => { if (!ctl.signal.aborted) setValues((v) => ({ ...v, [field]: null })) })
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
  const apply = () => { onClose(); router.push(`/console/orders${filterParams(draft).length || ask.tab !== 'to_confirm' || ask.q ? `?${query(ask, draft)}` : ''}`, { scroll: false }) }
  const counted = (k: 'pay' | 'st', v: string) => values[k]?.find((x) => x.value === v)?.n
  const range = typeof draft.placed === 'object' ? draft.placed : {}
  const row = 'flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent md:min-h-9'

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 md:min-h-56">
        <ul aria-label="Filter by" className="flex flex-col gap-0.5 border-r border-line-soft pr-2">
          {FIELDS.map((f) => (
            <li key={f.key}><button type="button" aria-current={field === f.key ? 'true' : undefined} onClick={() => setField(f.key)}
              className={cn('flex min-h-11 w-full items-center rounded-md px-2.5 text-left text-sm md:min-h-9', field === f.key ? 'bg-select font-medium text-link' : 'hover:bg-accent')}>{f.label}</button></li>
          ))}
        </ul>
        <fieldset className="min-w-0">
          <legend className="sr-only">{FIELDS.find((f) => f.key === field)!.label}</legend>
          {field === 'pay' && PAY.map((p) => (
            <label key={p} className={row}><input type="checkbox" checked={!!draft.pay?.includes(p)} onChange={() => setDraft((d) => ({ ...d, pay: toggle<Pay>(d.pay, p) }))} />
              <span className="flex-1">{PAY_WORDS[p]}</span>{counted('pay', p) !== undefined ? <span className="font-num text-label text-muted-foreground tabular-nums">{counted('pay', p)}</span> : null}</label>
          ))}
          {field === 'st' && (values.st === undefined ? <p className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>
            : !values.st?.length ? <p className="px-2 py-2 text-sm text-muted-foreground">{values.st === null ? 'Could not count by state just now.' : 'No orders here have a state.'}</p>
              : <div className="max-h-64 overflow-y-auto">{values.st.map((v) => (
                <label key={v.value} className={row}><input type="checkbox" checked={!!draft.states?.includes(v.value as State)} onChange={() => setDraft((d) => ({ ...d, states: toggle<State>(d.states, v.value as State) }))} />
                  <span className="flex-1">{v.value}</span><span className="font-num text-label text-muted-foreground tabular-nums">{v.n}</span></label>
              ))}</div>)}
          {field === 'placed' && (
            <div className="flex flex-col gap-1">
              {PLACED.map((p) => (
                <label key={p} className={row}><input type="radio" name="placed" checked={draft.placed === p} onChange={() => setDraft((d) => ({ ...d, placed: p }))} />{PLACED_LABEL[p]}</label>
              ))}
              <div className="mt-1 grid grid-cols-2 gap-2 px-2">
                <label className="flex flex-col gap-1 text-label text-muted-foreground">From<input type="date" className={FIELD} value={range.from ?? ''} onChange={(e) => setDraft((d) => ({ ...d, placed: { ...(typeof d.placed === 'object' ? d.placed : {}), from: e.target.value || undefined } }))} /></label>
                <label className="flex flex-col gap-1 text-label text-muted-foreground">To<input type="date" className={FIELD} value={range.to ?? ''} onChange={(e) => setDraft((d) => ({ ...d, placed: { ...(typeof d.placed === 'object' ? d.placed : {}), to: e.target.value || undefined } }))} /></label>
              </div>
            </div>
          )}
          {field === 'total' && (
            <div className="grid grid-cols-2 gap-2 px-2">
              {(['min', 'max'] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-label text-muted-foreground">{k === 'min' ? 'From, ₹' : 'To, ₹'}
                  <input type="number" inputMode="numeric" min={0} step={1} className={FIELD} value={draft.total?.[k] !== undefined ? draft.total[k]! / 100 : ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) * 100
                      setDraft((d) => { const t = { ...d.total, [k]: v }; if (t[k] === undefined) delete t[k]; return { ...d, total: Object.keys(t).length ? t : undefined } })
                    }} />
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-line-soft pt-3">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={apply}>{count === null ? 'Show orders' : `Show ${count.toLocaleString('en-IN')} order${count === 1 ? '' : 's'}`}</Button>
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
  return (
    <>
      <button ref={trigger} type="button" popoverTarget={id} aria-expanded={open} aria-controls={id}
        className={cn(button({ variant: 'ghost', size: 'sm' }), 'hidden gap-1 text-link md:inline-flex')}><Plus aria-hidden="true" className="size-4" />Filter</button>
      <div ref={pop} id={id} popover="auto" role="dialog" aria-label="Filter orders" className="w-[440px] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md"
        onToggle={(e) => {
          const isOpen = (e as unknown as ToggleEvent).newState === 'open'
          setOpen(isOpen)
          if (isOpen && trigger.current) placeUnder(trigger.current, e.currentTarget, 'start')
          else trigger.current?.focus()
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
        <SlidersHorizontal aria-hidden="true" className="size-4" />Filters{active ? <span className="rounded-full bg-select px-1.5 font-num text-small text-link">{active}</span> : null}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filters" actions={null}>
        {open ? <Panel ask={ask} start="pay" onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  )
}
