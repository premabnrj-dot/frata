'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { closeShop, openShop } from '../shop-actions'
import { useOpenMoment } from './open-moment'

/** Open my shop (asks once), or, when open, close it again. Orders are kept either way. */
export function OpenShop({ address, open, ready, canManage }: { address: string; open: boolean; ready: boolean; canManage: boolean }) {
  const [ask, setAsk] = useState(false)
  // D0·3: the website runs on a Test key with no proved address; the refusal is drawn as its own dialog (mockup screen 2).
  const [notReady, setNotReady] = useState(false)
  const toast = useToast()
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
  const askRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => { if (known !== null && open === known) setKnown(null) }, [open, known])
  const isOpen = known ?? open
  const run = async (fn: typeof openShop, done: string) => {
    if (pending) return
    setPending(true)
    try {
      const r = await fn()
      // Opening says so through the moment; closing (and any failure) says so in a toast.
      if (!r.ok && 'website' in r && r.website) setNotReady(true)
      else if (!r.ok) toast.error(r.error)
      else if (!(fn === openShop && moment)) toast.ok(done)
      setAsk(false)
      if (r.ok) { setKnown(fn === openShop); if (fn === openShop) moment?.opened(); else moment?.closed() }
    } catch {
      toast.error('We couldn’t reach Frrata.', { sub: 'Nothing was changed. Try again.' })
    } finally {
      setPending(false)
    }
    // No router.refresh(): the action's revalidatePath already re-renders this page.
  }
  // The question takes focus when it appears (the button that asked it is gone); dismissing it gives focus back.
  useEffect(() => { if (ask) askRef.current?.focus(); else if (back.current) { back.current = false; triggerRef.current?.focus() } }, [ask])
  // D0·3's dialog opened after "Open it" was gone: closing it puts focus back on Open my store itself (design-system review).
  const wasNotReady = useRef(false)
  useEffect(() => { if (notReady) wasNotReady.current = true; else if (wasNotReady.current) { wasNotReady.current = false; triggerRef.current?.focus() } }, [notReady])
  if (!canManage) return null
  return (
    <div className="space-y-2">
      <Dialog open={notReady} onClose={() => setNotReady(false)} title="Your store is still closed."
        actions={<><Link href="/console/settings/web-address" onClick={() => setNotReady(false)} className={button({ variant: 'primary' })}>Connect my domain</Link><Button variant="ghost" data-autofocus onClick={() => setNotReady(false)}>Keep it closed</Button></>}>
        <p>Your website runs on a Test key. Test keys stop when the store opens.</p>
      </Dialog>
      {isOpen ? (
        ask ? <div ref={askRef} tabIndex={-1} role="group" aria-label="Close your store?" className="flex flex-wrap items-center gap-3 text-sm outline-none"><span><b className="font-semibold">Close your store?</b> Shoppers can’t place orders until you open it.</span><Button variant="secondary" className="after:hidden" /* undoes something: no thread (brand rule 37) */ disabled={pending} onClick={() => run(closeShop, 'Closed. Shoppers see “Opening soon”.')}>Close store</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => { setAsk(false); back.current = true }}>Keep it open</button></div>
          : <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setAsk(true)} ref={triggerRef}>Close the store for now</button>
      ) : ask ? (
        <div ref={askRef} tabIndex={-1} role="group" aria-label="Open your store?" className="flex flex-wrap items-center gap-3 text-sm outline-none"><span>Shoppers can order from <span className="font-mono">{address}</span> now.</span><Button disabled={pending} onClick={() => run(openShop, `Your store is open at ${address}.`)}>Open it</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => { setAsk(false); back.current = true }}>Not yet</button></div>
      ) : (
        // Just closed here: it was open a moment ago, so it is ready, whatever a late render still says (e2e 90-ux).
        <Button disabled={!(ready || known === false || open) || pending} onClick={() => setAsk(true)} ref={triggerRef}>Open my store</Button>
      )}
    </div>
  )
}
