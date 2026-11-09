'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/icons/icon'
import { editLookAction, undoPublishAction } from '@/app/(console)/console/look/actions'

/**
 * After Publish (Look v3): the customizer re-renders with no draft, and this is what the person who just published
 * sees — the live look itself, full width behind a small popup: "Your shop has its new look", its address (copy),
 * Undo, Keep editing (a new draft from the live look), View your shop (a new tab). Closing it goes back to Look.
 * Not a page of its own any more (owner, 2026-11-09: a new page was friction).
 */
export function Published({ liveId, address, shopOpen, undoFrom }: { liveId: string; address: string; shopOpen: boolean; undoFrom: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, then: () => void) => start(async () => { setError(null); const r = await f(); if (!r.ok) setError(r.error ?? 'Something went wrong.'); else then() })
  const copy = async () => { try { await navigator.clipboard.writeText(`https://${address}`); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* the address stays selectable */ } }
  return (
    <main className="relative h-dvh overflow-hidden bg-muted">
      <iframe title="Your shop with its new look" src={`/console/theme-preview/${liveId}?as=shop`} tabIndex={-1} aria-hidden="true" className="pointer-events-none size-full" />
      <Dialog open onClose={() => router.push('/console/look')} title="Your shop has its new look" className="w-[min(28rem,calc(100vw-2rem))]"
        description={shopOpen ? 'Shoppers see it on their next visit.' : 'Shoppers see it when your shop opens.'}
        actions={<>
          {undoFrom && <Button variant="ghost" disabled={pending} onClick={() => run(() => undoPublishAction({ live: undoFrom }), () => router.push('/console/look'))}>Undo</Button>}
          <Button variant="secondary" disabled={pending} onClick={() => run(editLookAction, () => router.refresh())}>Keep editing</Button>
          <a href={shopOpen ? `https://${address}` : '/console/preview'} target="_blank" rel="noopener" data-autofocus className={button()}><Icon name="external" className="size-4" />View your shop</a>
        </>}>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
          <span className="min-w-0 flex-1 select-all truncate font-mono text-sm">{address}</span>
          <button type="button" onClick={copy} className="min-h-8 rounded-md px-2 text-sm underline-offset-4 hover:underline">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </Dialog>
    </main>
  )
}
