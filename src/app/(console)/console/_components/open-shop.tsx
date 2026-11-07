'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { closeShop, openShop } from '../shop-actions'

/** Open my shop (asks once), or, when open, close it again. Orders are kept either way. */
export function OpenShop({ address, open, ready, canManage }: { address: string; open: boolean; ready: boolean; canManage: boolean }) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** The one brand moment (frata-design-language § UX foundation rule 26): only right after this person opened it. */
  const [justOpened, setJustOpened] = useState(false)
  const [pending, start] = useTransition()
  const run = (fn: typeof openShop, done: string) => start(async () => {
    const r = await fn()
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error })
    setAsk(false)
    if (r.ok && fn === openShop) setJustOpened(true)
    if (r.ok) router.refresh()
  })
  if (!canManage) return null
  return (
    <div className="space-y-2">
      {open ? (
        ask ? <div className="flex flex-wrap items-center gap-3 text-sm"><span>Close your shop? Shoppers see “Opening soon”; orders are kept.</span><Button variant="secondary" disabled={pending} onClick={() => run(closeShop, 'Closed. Shoppers see “Opening soon”.')}>Close shop</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Keep it open</button></div>
          : <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setAsk(true)}>Close the shop for now</button>
      ) : ask ? (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>Shoppers can order from <span className="font-mono">{address}</span> now.</span><Button disabled={pending} onClick={() => run(openShop, `Your shop is open at ${address}.`)}>Open it</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Not yet</button></div>
      ) : (
        <Button disabled={!ready || pending} onClick={() => setAsk(true)}>Open my shop</Button>
      )}
      {justOpened && open ? (
        <div role="status" className="flex items-center gap-3">
          <svg viewBox="0 0 56 56" width="40" height="40" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-ok-mark">
            <circle cx="28" cy="28" r="24" stroke="currentColor" pathLength={1} className="animate-draw-circle" />
            <path d="M18 29l7 7 13-15" stroke="currentColor" pathLength={1} className="animate-draw-tick" />
          </svg>
          <p className="text-sm"><b className="block text-base">Your shop is open</b>Shoppers can order at <a href={`https://${address}`} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center font-mono underline">{address}</a></p>
        </div>
      ) : msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
    </div>
  )
}
