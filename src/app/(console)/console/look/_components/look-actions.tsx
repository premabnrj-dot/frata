'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { discardDraftAction, editLookAction, undoPublishAction } from '../actions'

/** Customize (primary), Preview, More: what a merchant does with the published look and the draft. */
export function LookActions({ canEdit, canPublish, hasDraft, undoFrom, restore = false, support }: { canEdit: boolean; canPublish: boolean; hasDraft: boolean; undoFrom: string | null
  /** The live version was recalled: one tap puts the previous look back (Undo's rule: the newest earlier available look). */
  restore?: boolean; support: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) => start(async () => {
    setError(null); const r = await f()
    if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
    then ? then() : router.refresh()
  })
  const [lost, setLost] = useState<string[]>([])
  const customize = () => start(async () => {
    setError(null); const r = await editLookAction()
    if (!r.ok) { setError(r.error); return }
    // Moved to the version Frrata offers now: say what didn't come across before opening the draft.
    if (r.lost.length) { setLost(r.lost); return }
    router.push('/console/look/customize')
  })
  if (!canEdit) return <p className="text-sm text-muted-foreground">{support ? 'Frrata support can look, not change the shop’s look.' : 'Ask the owner to change the shop’s look.'}</p>
  const items = [
    ...(hasDraft ? [{ label: 'Discard draft', onSelect: () => run(discardDraftAction), danger: true }] : []),
    ...(undoFrom ? [{ label: 'Undo last publish', onSelect: () => run(() => undoPublishAction({ live: undoFrom })) }] : []),
    { label: 'History', href: '/console/look/history' },
  ]
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap gap-2">
        {restore && undoFrom && <Button disabled={pending} onClick={() => run(() => undoPublishAction({ live: undoFrom }))}>Restore your previous look</Button>}
        <Button variant={restore ? 'secondary' : undefined} className={restore ? 'after:hidden' : undefined} disabled={pending} onClick={customize}>Customize</Button>
        <a href="/console/preview" className={button({ variant: 'secondary' })}>Preview shop</a>
        <Menu items={items} />
      </div>
      {!canPublish && <p className="text-sm text-muted-foreground">You can edit the draft; the owner or an admin publishes it.</p>}
      {lost.length > 0 && <div role="status" className="space-y-1 rounded-md bg-warn px-3 py-2 text-sm text-warn-text"><p>Your draft is on the version Frrata offers now. Not in it:</p><ul className="list-disc pl-5">{lost.map((x) => <li key={x}>{x}</li>)}</ul><a href="/console/look/customize" className="underline underline-offset-4">Open the draft</a></div>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </div>
  )
}
