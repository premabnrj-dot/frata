'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { closeShop, openShop } from '../shop-actions'
import { useOpenMoment } from './open-moment'

/** Open my shop (asks once), or, when open, close it again. Orders are kept either way. */
export function OpenShop({ address, open, ready, canManage }: { address: string; open: boolean; ready: boolean; canManage: boolean }) {
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** The one brand moment (rule 26) is drawn by the page's OpenMoment, which outlives this checklist. */
  const moment = useOpenMoment()
  const [pending, start] = useTransition()
  // What the last successful action made true, until the page's own render agrees: the action's revalidation and
  // a late, stale render can arrive in either order (e2e 90-ux, 2026-11-07 and again 2026-11-08), and the button
  // must never offer to close a shop the merchant just closed.
  const [known, setKnown] = useState<boolean | null>(null)
  useEffect(() => { if (known !== null && open === known) setKnown(null) }, [open, known])
  const isOpen = known ?? open
  const run = (fn: typeof openShop, done: string) => start(async () => {
    const r = await fn()
    // Opening says so through the moment; closing (and any failure) says so here.
    setMsg(r.ok ? (fn === openShop && moment ? null : { ok: true, text: done }) : { ok: false, text: r.error })
    setAsk(false)
    if (r.ok) { setKnown(fn === openShop); if (fn === openShop) moment?.opened(); else moment?.closed() }
    // No router.refresh(): the action's revalidatePath already re-renders this page, and a second refresh raced it —
    // a stale render (the shop still open) could land after the fresh one (e2e probe, 2026-11-07).
  })
  if (!canManage) return null
  return (
    <div className="space-y-2">
      {isOpen ? (
        ask ? <div className="flex flex-wrap items-center gap-3 text-sm"><span>Close your shop? Shoppers see “Opening soon”; orders are kept.</span><Button variant="secondary" className="after:hidden" /* undoes something: no thread (brand rule 37) */ disabled={pending} onClick={() => run(closeShop, 'Closed. Shoppers see “Opening soon”.')}>Close shop</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Keep it open</button></div>
          : <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setAsk(true)}>Close the shop for now</button>
      ) : ask ? (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>Shoppers can order from <span className="font-mono">{address}</span> now.</span><Button disabled={pending} onClick={() => run(openShop, `Your shop is open at ${address}.`)}>Open it</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Not yet</button></div>
      ) : (
        <Button disabled={!ready || pending} onClick={() => setAsk(true)}>Open my shop</Button>
      )}
      {msg && !msg.ok && <p role="alert" className="text-sm text-danger-text">{msg.text}</p>}
      {/* One status region that is always there, so a screen reader hears what lands in it. */}
      <div role="status">{msg?.ok && <p className="text-sm text-ok-text">{msg.text}</p>}</div>
    </div>
  )
}
