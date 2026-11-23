'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-context'
import { cn } from '@/lib/utils'
import type { SetupStepKey } from '@/domains/setup/checklist'
import { EMPTY, EMPTY_PRODUCT, type Drafts, type StepView } from './drafts'

// =============================================================================
// FILE: src/app/(console)/console/_components/setup/setup-actions.tsx — THE SETUP CARD'S ONE ISLAND
//
// Home before the store opens (plan docs/plans/2026-11-23-o2a-setup-card.md O2a·7, mockup § 2 "O2 · four steps"): the
// next step large (the ring, "N of 4 done", its title, one button), then the four steps as rows. Each step opens its
// popup; the popups, the uploader and "Open your store?" load with next/dynamic on first open, read their own values
// then, and keep what was typed until a save. Never two open at once. Steps stay derived on the server (setupSteps);
// a save revalidates the page, and the next step enters from the side.
// =============================================================================

const FirstProduct = dynamic(() => import('./popups').then((m) => m.FirstProduct), { ssr: false })
const BusinessDetails = dynamic(() => import('./popups').then((m) => m.BusinessDetails), { ssr: false })
const Payments = dynamic(() => import('./popups').then((m) => m.Payments), { ssr: false })
const OpenStore = dynamic(() => import('./popups').then((m) => m.OpenStore), { ssr: false })

type Popup = SetupStepKey

/** The ring's arc: from the top, clockwise, to `frac` of the circle (r 15 in a 36 box). */
function arc(frac: number): string {
  if (frac >= 1) return 'M18 3a15 15 0 1 1 0 30a15 15 0 1 1 0-30'
  const a = 2 * Math.PI * frac
  return `M18 3A15 15 0 ${frac > 0.5 ? 1 : 0} 1 ${(18 + 15 * Math.sin(a)).toFixed(2)} ${(18 - 15 * Math.cos(a)).toFixed(2)}`
}

export function SetupActions({ steps, next, picto, tenantId, address }: {
  steps: StepView[]
  next: SetupStepKey | null
  /** The next step's pictogram on its tile, drawn on the server (no pictogram drawing in this island's chunk). */
  picto: React.ReactNode
  tenantId: string
  address: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState<Popup | null>(null)
  const [loaded, setLoaded] = useState<Set<Popup>>(() => new Set())
  const [drafts, setDrafts] = useState<Drafts>(EMPTY)
  const done = steps.filter((s) => s.done).length
  const step = steps.find((s) => s.key === next) ?? null
  // The next step enters from the side once it changes after a save, never on the first paint.
  const first = useRef(next)
  const [moved, setMoved] = useState(false)
  useEffect(() => { if (next !== first.current) setMoved(true) }, [next])

  const show = (k: Popup) => {
    const s = steps.find((x) => x.key === k)!
    if (k === 'publish' && !s.done) {
      const left = steps.filter((x) => x.key !== 'publish' && !x.done).length
      if (left) { toast({ text: `Finish ${left} step${left === 1 ? '' : 's'} to open your store.` }); return }
    }
    setLoaded((l) => (l.has(k) ? l : new Set(l).add(k)))
    setOpen(k)
  }
  const close = () => setOpen(null)
  const saved = (k: Popup) => (text: string) => {
    setOpen(null)
    setDrafts((d) => ({ ...d, [k === 'product' ? 'product' : k]: k === 'product' ? EMPTY_PRODUCT : null }))
    if (text) toast.ok(text)
  }
  const set = <K extends keyof Drafts>(k: K) => (v: Drafts[K]) => setDrafts((d) => ({ ...d, [k]: v }))

  return (
    <>
      <div className="grid grid-cols-1 items-center gap-4 border-b border-line-soft p-4 md:grid-cols-[auto_minmax(0,1fr)] md:p-5">
        <div className="flex items-center gap-3.5">{step ? picto : null}</div>
        <div key={next ?? 'none'} className={cn('grid min-w-0 gap-2.5', moved && 'animate-step-forward')}>
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 36 36" className="size-9 shrink-0" role="img" aria-label={`${done} of ${steps.length} done`} fill="none" strokeWidth="4">
              <circle cx="18" cy="18" r="15" className="stroke-border" />
              {done > 0 && <path key={done} d={arc(done / steps.length)} pathLength={1} strokeLinecap="round" className="animate-draw-circle stroke-primary" />}
            </svg>
            <span aria-hidden="true" className="font-num text-label text-muted-foreground">{done} of {steps.length} done</span>
          </div>
          {step ? <>
            <h2 className="text-base leading-6 font-semibold">{step.title}</h2>
            <div className="flex flex-wrap gap-2"><Button onClick={() => show(step.key)}>{step.action}</Button></div>
          </> : null}
        </div>
      </div>
      <ul className="grid">
        {steps.map((s) => {
          const cur = s.key === next
          const inner = <>
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]', s.done ? 'border-ok-mark bg-ok-mark' : 'border-edge')} aria-hidden="true">
              {s.done && <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="animate-draw-tick" /></svg>}
            </span>
            <span className={cn('max-w-[72%] flex-none truncate', s.done && 'text-muted-foreground', cur && 'font-medium')}>{s.title}<span className="sr-only">{s.done ? ', done' : ''}</span></span>
            <span className="min-w-0 flex-1 truncate text-right text-label text-muted-foreground">{s.done ? s.value : ''}</span>
          </>
          const row = 'flex min-h-11 w-full min-w-0 items-center gap-2.5 border-b border-line-soft px-4 text-left text-sm md:px-5'
          return (
            <li key={s.key} className="[&:last-child>*]:border-b-0">
              {!s.mine ? <div className={row}>{inner}</div>
                : s.key === 'product' && s.done ? <Link href="/console/products" className={cn(row, 'hover:bg-sunk')}>{inner}</Link>
                : <button type="button" className={cn(row, 'hover:bg-sunk')} onClick={() => show(s.key)}>{inner}</button>}
            </li>
          )
        })}
      </ul>
      {loaded.has('product') && <FirstProduct open={open === 'product'} draft={drafts.product} setDraft={set('product')} onClose={close} onSaved={saved('product')} tenantId={tenantId} />}
      {loaded.has('details') && <BusinessDetails open={open === 'details'} draft={drafts.details} setDraft={set('details')} onClose={close} onSaved={saved('details')} />}
      {loaded.has('payments') && <Payments open={open === 'payments'} draft={drafts.payments} setDraft={set('payments')} onClose={close} onSaved={saved('payments')} connected={steps.some((s) => s.key === 'payments' && s.value.startsWith('UPI'))} />}
      {loaded.has('publish') && <OpenStore open={open === 'publish'} onClose={close} address={address} />}
    </>
  )
}
