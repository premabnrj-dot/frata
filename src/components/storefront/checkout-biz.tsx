'use client'

import { useEffect, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { b2bProblem, cleanGstin, gstinStateName, gstinValid } from '@/domains/tax/gstin'

// =============================================================================
// FILE: src/components/storefront/checkout-biz.tsx — "Claim GST input credit" at checkout, in its own chunk (only a
// shop that offers GST invoices shows it; checkout's first-load budget is 121 kB). It hands the checkout its check.
// =============================================================================

export type Biz = { on: boolean; gstin: string; name: string }
export type BizCheck = (b: Biz, deliveryState: string) => { field: 'gstin' | 'name'; error: string } | null

export default function CheckoutBiz({ biz, setBiz, errors, clear, register, field, label, err }: {
  biz: Biz; setBiz: Dispatch<SetStateAction<Biz>>; errors: Record<string, string>; clear: (k: string) => void
  register: (check: BizCheck) => void; field: string; label: string; err: (k: string) => ReactNode
}) {
  useEffect(() => { register((b, state) => b2bProblem(b.gstin, b.name, state)) }, [register])
  const g = cleanGstin(biz.gstin)
  const st = g.length === 15 && gstinValid(g) ? gstinStateName(g) : null
  return (
    <fieldset className="space-y-3 rounded-sm border border-store-line p-3">
      <legend className="sr-only">GST invoice for a business</legend>
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor="biz" className="font-medium">Claim GST input credit</label>
        <button id="biz" type="button" role="switch" aria-checked={biz.on} onClick={() => setBiz((b) => ({ ...b, on: !b.on }))}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-fast ${biz.on ? 'bg-store-good' : 'bg-store-line'}`}>
          <span aria-hidden className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-store-paper shadow transition-transform duration-fast ${biz.on ? 'translate-x-4' : ''}`} />
        </button>
      </div>
      {biz.on ? <>
        <div><label htmlFor="bizGstin" className={label}>GSTIN</label>
          <input id="bizGstin" value={biz.gstin} maxLength={15} autoCapitalize="characters" spellCheck={false} onChange={(e) => { setBiz((b) => ({ ...b, gstin: e.target.value.toUpperCase() })); clear('bizGstin') }}
            aria-invalid={!!errors.bizGstin || undefined} aria-describedby="bizGstin-err" className={`${field} font-mono`} />
          {errors.bizGstin ? err('bizGstin') : st ? <p className="mt-1 text-xs text-store-good">✓ Registered in {st}</p> : null}</div>
        <div><label htmlFor="bizName" className={label}>Business name</label>
          <input id="bizName" value={biz.name} maxLength={120} autoComplete="organization" onChange={(e) => { setBiz((b) => ({ ...b, name: e.target.value })); clear('bizName') }}
            aria-invalid={!!errors.bizName || undefined} aria-describedby="bizName-err" className={field} />
          {err('bizName')}</div>
      </> : null}
    </fieldset>
  )
}
