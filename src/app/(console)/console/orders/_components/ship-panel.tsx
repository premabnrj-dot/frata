'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Toaster, useToast } from '@/components/ui/toast'
import { cameBackOrder, deliverOrder, lostOrder, shipOrder, undoOutcomeAction } from '../actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/ship-panel.tsx
//
// THE ORDER PAGE'S SHIPPING (Ship S·0, design language 54–56): a packed order is shipped another way (courier and
// tracking number optional); a shipped one gets Delivered, Came back (with "Put the stock back") or Lost by the
// courier. Each is one tap (Came back and Lost ask first), with Undo in the toast. The server decides who may
// (`may`, passed in) and checks again in every action. No cost figure here: staff use it too. After an outcome the
// page still renders the panel (stage `done`, nothing shown) so the toast and its Undo survive the refresh (e2e 49).
// =============================================================================

type ShipPanelProps = {
  orderId: string; number: string
  stage: 'to_ship' | 'on_the_way' | 'done'
  may: { ship: boolean; outcome: boolean }
  shipment: { courierName: string | null; trackingNumber: string | null; byCourier: boolean } | null
  stockTaken: boolean
}

function Panel({ orderId, number, stage, may, shipment, stockTaken }: ShipPanelProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [courier, setCourier] = useState(''), [tracking, setTracking] = useState('')
  const [ask, setAsk] = useState<null | 'came_back' | 'lost'>(null)
  const [restock, setRestock] = useState(true)
  const field = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm md:h-9'

  async function go(word: string, fn: () => Promise<{ ok: true; eventId: string } | { ok: false; error: string }>) {
    if (busy) return
    setBusy(true)
    let r: { ok: true; eventId: string } | { ok: false; error: string }
    try { r = await fn() } catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing was changed.' } }
    setBusy(false); setAsk(null)
    if (!r.ok) { toast({ text: r.error }); return }
    const eventId = r.eventId
    toast({ text: `${number} marked ${word}.`, undo: async () => { const u = await undoOutcomeAction(eventId); router.refresh(); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
    router.refresh()
  }

  if (stage === 'done') return null
  if (stage === 'to_ship') {
    if (!may.ship) return null
    return (
      <Section id="ship" title="Shipped another way">
        <p className="text-sm text-muted-foreground">A local courier, or your own Shiprocket panel. Both details are optional.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor="ship-courier" className="block text-sm font-medium">Courier</label>
            <input id="ship-courier" value={courier} maxLength={60} onChange={(e) => setCourier(e.target.value)} placeholder="Professional Couriers" className={field} /></div>
          <div className="space-y-1"><label htmlFor="ship-tracking" className="block text-sm font-medium">Tracking number</label>
            <input id="ship-tracking" value={tracking} maxLength={40} onChange={(e) => setTracking(e.target.value)} className={`${field} font-mono`} /></div>
        </div>
        <Button onClick={() => void go('shipped', () => shipOrder(orderId, { courierName: courier || undefined, trackingNumber: tracking || undefined }))} aria-disabled={busy}>Mark shipped</Button>
      </Section>
    )
  }
  return (
    <Section id="ship" title="On the way">
      {shipment ? <p className="text-sm">{shipment.courierName ?? 'Courier not named'}{shipment.trackingNumber ? <> · <span className="font-mono">{shipment.trackingNumber}</span></> : null}</p> : null}
      {shipment?.byCourier ? <p className="text-sm text-muted-foreground">Shipped with Shiprocket: its tracking sets delivered or returned.</p>
        : may.outcome ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void go('delivered', () => deliverOrder(orderId))} aria-disabled={busy}>Delivered</Button>
            <Button variant="secondary" onClick={() => { setRestock(stockTaken); setAsk('came_back') }} aria-disabled={busy}>Came back</Button>
            <Button variant="ghost" onClick={() => setAsk('lost')} aria-disabled={busy}>Lost by the courier</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">An owner or admin marks it delivered or came back.</p>}
      <Dialog open={ask === 'came_back'} onClose={() => setAsk(null)} title={`${number} came back?`}
        description="It came back to the shop without being delivered (RTO). Nothing was collected."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setAsk(null)}>Not yet</Button><Button onClick={() => void go('came back', () => cameBackOrder(orderId, restock))} aria-disabled={busy}>Came back</Button></>}>
        {stockTaken ? <label className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-5 accent-primary" />Put the stock back (it can't be undone after)</label> : null}
      </Dialog>
      <Dialog open={ask === 'lost'} onClose={() => setAsk(null)} title={`Lost by the courier?`}
        description="The courier lost or damaged the parcel. It is never billed as delivered; claim it with the courier."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setAsk(null)}>Not yet</Button><Button variant="destructive" onClick={() => void go('lost', () => lostOrder(orderId))} aria-disabled={busy}>Mark lost</Button></>} />
    </Section>
  )
}

export function ShipPanel(p: ShipPanelProps) {
  return <Toaster><Panel {...p} /></Toaster>
}
