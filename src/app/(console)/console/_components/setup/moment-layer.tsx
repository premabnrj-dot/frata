'use client'

import { useEffect, useRef } from 'react'
import { Button, button } from '@/components/ui/button'
import { CopyLink } from '../copy-link'

// The open moment (mockup § 2 `.open-fx`, rule 26, plan O2a·8): a native <dialog> opened with showModal(), so the top
// layer covers the whole frame, the sidebar included, and holds focus; the page's surface, a centred box. The drawn rani
// check (circle, then tick; § Deviations 2), "<Store> is open" in the display face, the address with Copy link, Share on
// WhatsApp, and Go to Home — focused 80 ms after it opens, as drawn; Esc closes it too. Its four parts rise one after
// another (animate-rise-stagger, a delay on the approved rise); reduced motion shows them at once.

export function MomentLayer({ name, address, whatsapp, onClose }: { name: string; address: string; whatsapp: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const home = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    const t = window.setTimeout(() => home.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [])
  const close = () => { ref.current?.close(); onClose() }
  const rise = (i: number) => ({ style: { '--i': i } as React.CSSProperties })
  return (
    <dialog ref={ref} aria-labelledby="open-moment-h" onCancel={(e) => { e.preventDefault(); close() }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none place-items-center bg-card p-6 text-center text-foreground backdrop:bg-card open:grid">
      <div className="grid max-w-85 justify-items-center gap-3.5">
        <svg {...rise(0)} viewBox="0 0 56 56" width="64" height="64" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-rise-stagger text-brand">
          <circle cx="28" cy="28" r="24" stroke="currentColor" pathLength={1} className="animate-draw-circle" />
          <path d="M18 29l7 7 13-15" stroke="currentColor" pathLength={1} className="animate-draw-tick" />
        </svg>
        <h2 id="open-moment-h" {...rise(1)} className="animate-rise-stagger font-display text-2xl leading-8 font-semibold tracking-tight">{name} is open</h2>
        <div {...rise(2)} className="animate-rise-stagger"><CopyLink address={address} /></div>
        <div {...rise(3)} className="flex animate-rise-stagger flex-wrap justify-center gap-2">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={button({ variant: 'primary' })}>Share on WhatsApp</a>
          <Button ref={home} variant="secondary" onClick={close}>Go to Home</Button>
        </div>
      </div>
    </dialog>
  )
}
