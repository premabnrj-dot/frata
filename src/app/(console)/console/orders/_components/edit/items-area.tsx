'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Toaster, useToast } from '@/components/ui/toast'
import { undoItemsEdit } from '../../edit-actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/items-area.tsx
//
// THE ITEMS CARD, EDITED IN PLACE (OE·1; mockup docs/mockups/2026-11-11-import-and-order-edit.html, views COD and
// Saved). The server renders the card; "Edit items" swaps it for the editor, whose code and pricing load only then
// (next/dynamic), so an order page that is only read carries none of it. The server decides who sees the button
// (owners and admins, until packed, never on a support visit; paid online too since OE·2) and checks again on Save. While an edit
// can still be undone, the card keeps its Undo beside "Edit items".
// =============================================================================

const ItemsEditor = dynamic(() => import('./items-editor'), { ssr: false, loading: () => <p className="text-sm text-muted-foreground" role="status">Loading its items…</p> })

type Ctx = { open: () => void; undo: (() => Promise<void>) | null }
const Edit = createContext<Ctx | null>(null)

function Area({ orderId, number, undoEvent, children }: { orderId: string; number: string; undoEvent: string | null; children: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const undo = undoEvent ? async () => {
    const r = await undoItemsEdit(undoEvent)
    // A refusal (a refund already with Razorpay, the window passed) is an error toast (§ Feedback 1).
    if (r.ok) toast({ text: `${number}: change undone.` }); else toast.error(r.error)
    router.refresh()
  } : null
  return (
    <Edit.Provider value={{ open: () => setEditing(true), undo }}>
      {editing ? <ItemsEditor orderId={orderId} number={number} onClose={() => setEditing(false)} /> : children}
    </Edit.Provider>
  )
}

/** The Items card, or its editor. */
export function ItemsArea(p: { orderId: string; number: string; undoEvent: string | null; children: React.ReactNode }) {
  return <Toaster><Area {...p} /></Toaster>
}

/** The Items card's header actions: Undo while the last edit can be undone, and "Edit items". */
export function EditItemsButton({ canEdit }: { canEdit: boolean }) {
  const ctx = useContext(Edit)
  const [busy, setBusy] = useState(false)
  if (!ctx) return null
  return (
    <span className="flex flex-wrap items-center gap-2">
      {ctx.undo ? <Button variant="ghost" aria-disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await ctx.undo!() } finally { setBusy(false) } }}>Undo the change</Button> : null}
      {canEdit ? <Button variant="secondary" onClick={ctx.open}>Edit items</Button> : null}
    </span>
  )
}
