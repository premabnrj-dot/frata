'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { discardDraftAction, editLookAction, undoPublishAction } from '../actions'

/** Customize (primary), Preview, More: what a merchant does with the published look and the draft. */
export function LookActions({ canEdit, canPublish, hasDraft, undoFrom, support }: { canEdit: boolean; canPublish: boolean; hasDraft: boolean; undoFrom: string | null; support: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) => start(async () => {
    setError(null); const r = await f()
    if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
    then ? then() : router.refresh()
  })
  const customize = () => start(async () => {
    setError(null); const r = await editLookAction()
    if (!r.ok) { setError(r.error); return }
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
        <Button disabled={pending} onClick={customize}>Customize</Button>
        <a href="/console/preview" className={button({ variant: 'secondary' })}>Preview shop</a>
        <Menu items={items} />
      </div>
      {!canPublish && <p className="text-sm text-muted-foreground">You can edit the draft; the owner or an admin publishes it.</p>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </div>
  )
}
