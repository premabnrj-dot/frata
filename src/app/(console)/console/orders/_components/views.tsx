'use client'

import { MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { Menu } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast-context'
import type { QueueTab } from '@/domains/orders/order-state'
import { removeView, renameView, restoreView, saveView } from '../view-actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/views.tsx — "+ SAVE VIEW" AND A VIEW'S MENU (Neel N1c·2).
//
// Save keeps the tab and the filters as a tab for the whole team (never the search). A view's menu: Rename, and Remove
// with Undo (restored by id). Each goes through ../view-actions.ts; the page refreshes from the server after.
// =============================================================================

function NameDialog({ title, initial, cta, open, onClose, onSave }: { title: string; initial: string; cta: string; open: boolean; onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null)
    const e = await onSave(name).catch(() => 'We could not save that. Try again.')
    setBusy(false)
    if (e) setError(e); else onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title={title}
      actions={<><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" busy={busy} onClick={() => void submit()}>{cta}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-col gap-1.5">
        <label htmlFor="view-name" className="text-label font-medium">Name</label>
        <input id="view-name" className={FIELD} value={name} maxLength={40} autoFocus onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'view-name-error' : undefined} />
        <FieldError id="view-name-error" message={error} />
      </form>
    </Dialog>
  )
}

export function SaveView({ tab, query }: { tab: QueueTab; query: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(button({ variant: 'link' }), 'min-h-11 md:min-h-10')}>+ Save view</button>
      {open ? <NameDialog title="Save view" initial="" cta="Save view" open={open} onClose={() => setOpen(false)} onSave={async (name) => {
        const r = await saveView({ name, tab, query })
        if (!r.ok) return r.error
        toast.ok(`Saved “${r.name}”.`); router.refresh(); return null
      }} /> : null}
    </>
  )
}

export function ViewMenu({ id, name, leaveTo }: { id: string; name: string; leaveTo: string }) {
  const router = useRouter()
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  return (
    <>
      <Menu label={`${name}: view options`} size="sm" icon={<MoreHorizontal aria-hidden="true" className="size-4" />} items={[
        { label: 'Rename', onSelect: () => setRenaming(true) },
        { label: 'Remove', danger: true, onSelect: async () => {
          const r = await removeView(id)
          if (!r.ok) { toast.error(r.error); return }
          router.push(leaveTo, { scroll: false })
          toast({ text: `Removed “${name}”.`, undo: async () => { const u = await restoreView(id); router.refresh(); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
        } },
      ]} />
      {renaming ? <NameDialog title="Rename view" initial={name} cta="Rename" open={renaming} onClose={() => setRenaming(false)} onSave={async (n) => {
        const r = await renameView(id, n)
        if (!r.ok) return r.error
        router.refresh(); return null
      }} /> : null}
    </>
  )
}
