'use client'

import { useEffect, useRef, useState } from 'react'
import { useBag } from './bag-store'
import { ADDED_TO_BAG, NO_CONNECTION, PRICING_BAG } from './bag-words'
import { chunk } from './chunk'
import { CloseMark } from './close-mark'

// The drawer's lines (bag-contents.tsx, with the bag's price) load in their own chunk: every shop page carries this
// button, and the lines are needed only once the bag opens (the shop's script budgets: check:storefront-build). They are
// fetched when the browser is next idle after the page has run (not on /bag, whose page draws them already), or at once
// when the bag opens first; meanwhile an open drawer says what its lines say first ("Added to your bag", "Pricing your
// bag…"). A chunk that could not load is tried again at the next open, and the drawer says so as its lines would.
type Contents = typeof import('./bag-contents').BagContents
const loadContents = chunk(() => import('./bag-contents').then((m) => m.BagContents))
const idle = (f: () => void) => {
  if (typeof requestIdleCallback === 'function') { const h = requestIdleCallback(f, { timeout: 2000 }); return () => cancelIdleCallback(h) }
  const h = setTimeout(f, 1); return () => clearTimeout(h)
}

/** The header's bag button and the drawer it opens (also opened by Add to bag). */
export function BagButton({ checkoutHref, shopHref, label = 'Bag', count = ['Bag, 1 item', 'Bag, {n} items'], icon }: { checkoutHref: string; shopHref: string; label?: string
  /** The shop's bag icon, drawn on the server (Look v4): shown in place of the word, the count on it; the name stays. */
  icon?: React.ReactNode
  /** The button's name with a count, one and many (the shop's words; the name starts with the visible label). */
  count?: [string, string] }) {
  const items = useBag()
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<string | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const [Contents, setContents] = useState<{ C: Contents } | null>(null)
  const [unloaded, setUnloaded] = useState(false)
  useEffect(() => {
    if (Contents) return
    let live = true
    const load = () => void loadContents().then((C) => { if (live) setContents({ C }) }, () => { if (live && open) setUnloaded(true) })
    if (open) load()
    const stop = open || window.location.pathname === '/bag' ? undefined : idle(load)
    return () => { live = false; stop?.() }
  }, [open, Contents])
  useEffect(() => {
    const o = (e: Event) => { setAdded(typeof (e as CustomEvent).detail === 'string' ? (e as CustomEvent<string>).detail : null); setOpen(true) }
    window.addEventListener('frata:open-bag', o)
    return () => window.removeEventListener('frata:open-bag', o)
  }, [])
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); if (!open) ref.current?.close() }, [open])
  const n = items.reduce((a, i) => a + i.qty, 0)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={icon ? 'relative grid size-11 shrink-0 place-items-center' : 'shrink-0 whitespace-nowrap px-2 py-2 text-sm'} aria-label={(n === 1 ? count[0] : count[1]).replace('{n}', String(n))}>
        {icon ? <>{icon}{n > 0 && <span key={n} className="absolute right-0.5 top-0.5 grid min-w-4 animate-count place-items-center rounded-full bg-store-accent px-1 text-[0.625rem] font-medium leading-4 text-store-on-accent">{n}</span>}</>
          : <>{label}{n ? <> · <span key={n} className="inline-block animate-count">{n}</span></> : ''}</>}
      </button>
      <dialog ref={ref} data-store-drawer onClose={() => { setOpen(false); setAdded(null); setUnloaded(false) }} aria-label="Your bag"
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md overflow-y-auto bg-store-paper p-0 text-store-ink">
        {open && (
          <div className="p-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-medium">Your bag</h2><button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center text-xl" aria-label="Close bag"><CloseMark className="size-4" /></button></div>
            {Contents ? <Contents.C added={added} onCheckout={() => { window.location.href = checkoutHref }} onKeepShopping={() => { setOpen(false); if (!n) window.location.href = shopHref }} />
              // feedback-ok: rule 4 — the bag drawer is a modal dialog: its own load failure stays inside it (bag-contents.tsx's words)
              : unloaded ? <p role="alert" className="text-sm text-store-bad">{NO_CONNECTION}</p>
              : items.length ? <div className="space-y-3">{added && items.some((i) => i.variantId === added) && <p role="status" className="store-added-note text-sm font-medium">{ADDED_TO_BAG}</p>}<p className="text-sm text-store-sub">{PRICING_BAG}</p></div> : null}
          </div>
        )}
      </dialog>
    </>
  )
}
