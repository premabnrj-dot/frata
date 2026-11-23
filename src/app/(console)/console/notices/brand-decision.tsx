'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { decideBrandAction, undoBrandAction, undoCheckoutAction } from '../brand/actions'

/** Approve change and Decline on a partner's waiting brand change (one-address P1, mockup screen 5), in Notices and on
 *  the review card of Brand and Brand › Checkout (four-screens § 4). The answer names the exact proposal shown and its
 *  kind; a stale one comes back in the server's words with Reload. The server decides who may answer (decideBrand);
 *  this only draws the two buttons for the owner and a Manager. */
export function BrandDecision({ id, kind = 'brand', onDone }: { id: string
  /** One-address P2·6: a checkout design change is undone on the design, not the record. */
  kind?: 'brand' | 'checkout'
  /** After an answer lands (the card moves focus to the page's heading: its buttons are gone). */
  onDone?: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState<'approve' | 'decline' | null>(null)
  const decide = async (decision: 'approve' | 'decline') => {
    setPending(decision)
    const r = await decideBrandAction({ id, decision, kind })
    setPending(null)
    if (!r.ok) { toast.error(r.error, { action: { label: 'Reload', run: () => window.location.reload() } }); return }
    onDone?.()
    if (decision === 'approve' && r.version) {
      const v = r.version
      toast.ok('Approved. It’s live.', { undo: async () => { const u = await (kind === 'checkout' ? undoCheckoutAction : undoBrandAction)({ version: v }); if (u.ok) router.refresh(); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
    } else toast.ok('Declined. Nothing changed.')
    router.refresh()
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" busy={pending === 'approve'} disabled={pending === 'decline'} onClick={() => void decide('approve')}>Approve change</Button>
      <Button size="sm" variant="secondary" busy={pending === 'decline'} disabled={pending === 'approve'} onClick={() => void decide('decline')}>Decline</Button>
    </div>
  )
}
