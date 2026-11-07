'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { closeShop, openShop } from '../shop-actions'
import { useOpenMoment } from './open-moment'

/** Open my shop (asks once), or, when open, close it again. Orders are kept either way. */
export function OpenShop({ address, open, ready, canManage }: { address: string; open: boolean; ready: boolean; canManage: boolean }) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** The one brand moment (rule 26) is drawn by the page's OpenMoment, which outlives this checklist. */
  const moment = useOpenMoment()
  const [pending, start] = useTransition()
  const run = (fn: typeof openShop, done: string) => start(async () => {
    const r = await fn()
    // Opening says so through the moment; closing (and any failure) says so here.
    setMsg(r.ok ? (fn === openShop && moment ? null : { ok: true, text: done }) : { ok: false, text: r.error })
    setAsk(false)
    if (r.ok) { if (fn === openShop) moment?.opened(); else moment?.closed() }
    if (r.ok) router.refresh()
  })
  if (!canManage) return null
  return (
    <div className="space-y-2">
      {open ? (
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
