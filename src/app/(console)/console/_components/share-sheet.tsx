'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { ShareData, ShareTarget } from '@/lib/seo/share'
import { shareQr } from '../share-actions'

/** Share a product, a collection or the shop (search and sharing S1·7, as the approved mockup): the card every app
 *  shows, then WhatsApp, Instagram, Facebook, QR code and the link. Each link carries its channel's tags. */
export function ShareSheet({ share, target }: { share: ShareData; target: ShareTarget }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const [qr, setQr] = useState<string | null>(null)
  // The card is drawn on the shop's own address; until it loads, or if it can't (a shop address this browser can't
  // reach), a plain tile of the same shape stands in, never the browser's broken-image glyph.
  const [cardFailed, setCardFailed] = useState(false)
  const [pending, start] = useTransition()
  const linkRef = useRef<HTMLInputElement>(null)
  const copy = (text: string, done: string) => (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
    () => toast.ok(done),
    () => { if (linkRef.current) { linkRef.current.value = text; linkRef.current.select() } toast.error('Selected: copy it with your keyboard.') },
  )
  const makeQr = () => start(async () => {
    const r = await shareQr(target.kind, 'id' in target ? target.id : null)
    // A refusal was shown green as a status line; it is an error toast (drawn inside this Dialog while it is open).
    if (r.ok) setQr(r.png); else toast.error(r.error)
  })
  const opt = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium hover:bg-muted'
  return (
    <>
      <Button variant="secondary" disabled={!share.ready} onClick={() => { setQr(null); setCardFailed(false); setOpen(true) }}>Share</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Share ${share.title}`}
        actions={<Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Done</Button>}>
        <div className="space-y-3">
          {share.card && (cardFailed
            ? <div aria-hidden="true" className="aspect-[1200/630] w-full rounded-md border border-border bg-muted" />
            : <img src={share.card} alt="" width={1200} height={630} onError={() => setCardFailed(true)} ref={(el) => { if (el?.complete && el.naturalWidth === 0) setCardFailed(true) }} className="aspect-[1200/630] w-full rounded-md border border-border bg-muted object-cover" />)}
          <div className="grid grid-cols-4 gap-2">
            <a className={opt} href={share.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <button type="button" className={opt} onClick={() => copy(share.links.share_instagram, 'Copied for Instagram.')}>Instagram</button>
            <a className={opt} href={share.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
            <button type="button" className={opt} disabled={pending} onClick={makeQr}>QR code</button>
          </div>
          {qr && (
            <div className="flex items-center gap-3">
              <img src={qr} alt={`QR code for ${share.title}`} width={128} height={128} className="size-32 rounded-sm border border-border" />
              <a href={qr} download={`${share.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'shop'}-qr.png`} className="text-sm font-medium underline">Download</a>
            </div>
          )}
          <div className="flex gap-2">
            <label htmlFor="share-link" className="sr-only">Link</label>
            <input id="share-link" ref={linkRef} readOnly defaultValue={share.links.share_copy} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-muted px-2 font-mono text-xs" />
            <Button onClick={() => copy(share.links.share_copy, 'Link copied.')}>Copy link</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
