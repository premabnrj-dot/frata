'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Publish's confirm (Look v3, owner 2026-11-09: "keep it minimal"): a small popover under the button, one line and
 * two buttons, no list of changes. Only what stops a publish is listed (each with Fix, which opens that section).
 * Esc or a click outside closes it. A failed publish is an error toast (the editor's; this closes first).
 */
export function PublishConfirm({ themeName, shopOpen, blocking, pending, onCancel, onPublish, onFix }: {
  themeName: string; shopOpen: boolean; blocking: string[]; pending: boolean
  onCancel: () => void; onPublish: () => void; onFix: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel); cancel.current = onCancel
  // Once per opening (impact review: a new onCancel each render re-ran this and pulled focus back): focus Not yet,
  // close on Esc or a click outside (the Publish button toggles it itself), and give focus back to Publish after.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel.current() }
    const out = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest('[data-publish]')) cancel.current() }
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', out)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', out); if (opener?.isConnected) opener.focus() }
  }, [])
  return (
    <div ref={ref} role="dialog" aria-labelledby="pub-q" className="absolute right-0 top-full z-40 mt-2 w-72 origin-top-right space-y-1 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg transition-[opacity,scale] duration-fast ease-entrance starting:scale-95 starting:opacity-0">
      <p id="pub-q" className="font-semibold">Publish {themeName}?</p>
      <p className="text-sm text-muted-foreground">{shopOpen ? 'Shoppers see it on their next visit.' : 'Shoppers see it when your shop opens.'}</p>
      {/* feedback-ok: Publish's blocking list is pinned in place (rule 5), each line with its Fix */}
      {blocking.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 rounded-md bg-danger p-2 text-sm text-danger-text">
          {blocking.map((b) => <li key={b} className="flex items-center justify-between gap-2"><span>{b}</span><button type="button" onClick={() => onFix(b)} className="shrink-0 underline underline-offset-4">Fix</button></li>)}
        </ul>
      )}
      <div className="flex justify-end gap-2 pt-3">
        <Button variant="secondary" className="after:hidden" data-autofocus onClick={onCancel}>Not yet</Button>
        <Button disabled={pending || blocking.length > 0} onClick={onPublish}>Publish</Button>
      </div>
    </div>
  )
}
