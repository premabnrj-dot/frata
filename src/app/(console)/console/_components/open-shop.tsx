'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { closeShop, openShop } from '../shop-actions'
import { useOpenMoment } from './open-moment'

/** Open my shop (asks once), or, when open, close it again. Orders are kept either way. */
export function OpenShop({ address, open, ready, canManage }: { address: string; open: boolean; ready: boolean; canManage: boolean }) {
  const [ask, setAsk] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** The one brand moment (rule 26) is drawn by the page's OpenMoment, which outlives this checklist. */
  const moment = useOpenMoment()
  // Busy is this button's own, for the action's round trip only — never a React transition. A transition stays
  // pending until Next has re-rendered the whole page after the action's revalidation; when that render is slow, or
  // a stale one lands first, the button sat disabled (e2e 90-ux, failing on and off 2026-11-07 → 2026-11-09).
  const [pending, setPending] = useState(false)
  // What the last successful action made true, until the page's own render agrees: the revalidation and a late,
  // stale render can arrive in either order, and the button must never offer to close a shop just closed. The
  // action's answer decides; the page's prop takes over again once it matches.
  const [known, setKnown] = useState<boolean | null>(null)
  useEffect(() => { if (known !== null && open === known) setKnown(null) }, [open, known])
  const isOpen = known ?? open
  const run = async (fn: typeof openShop, done: string) => {
    if (pending) return
    setPending(true)
    try {
      const r = await fn()
      // Opening says so through the moment; closing (and any failure) says so here.
      setMsg(r.ok ? (fn === openShop && moment ? null : { ok: true, text: done }) : { ok: false, text: r.error })
      setAsk(false)
      if (r.ok) { setKnown(fn === openShop); if (fn === openShop) moment?.opened(); else moment?.closed() }
    } catch {
      setMsg({ ok: false, text: 'We could not reach Frrata. Nothing was changed; try again.' })
    } finally {
      setPending(false)
    }
    // No router.refresh(): the action's revalidatePath already re-renders this page.
  }
  if (!canManage) return null
  return (
    <div className="space-y-2">
      {isOpen ? (
        ask ? <div className="flex flex-wrap items-center gap-3 text-sm"><span>Close your shop? Shoppers see “Opening soon”; orders are kept.</span><Button variant="secondary" className="after:hidden" /* undoes something: no thread (brand rule 37) */ disabled={pending} onClick={() => run(closeShop, 'Closed. Shoppers see “Opening soon”.')}>Close shop</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Keep it open</button></div>
          : <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setAsk(true)}>Close the shop for now</button>
      ) : ask ? (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>Shoppers can order from <span className="font-mono">{address}</span> now.</span><Button disabled={pending} onClick={() => run(openShop, `Your shop is open at ${address}.`)}>Open it</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setAsk(false)}>Not yet</button></div>
      ) : (
        // Just closed here: it was open a moment ago, so it is ready, whatever a late render still says (e2e 90-ux).
        <Button disabled={!(ready || known === false || open) || pending} onClick={() => setAsk(true)}>Open my shop</Button>
      )}
      {msg && !msg.ok && <p role="alert" className="text-sm text-danger-text">{msg.text}</p>}
      {/* One status region that is always there, so a screen reader hears what lands in it. */}
      <div role="status">{msg?.ok && <p className="text-sm text-ok-text">{msg.text}</p>}</div>
    </div>
  )
}
