'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FIELD } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { addressLine, addressUsable } from '@/domains/signup/steps'
import { useAddressCheck } from './use-address-check'

/** "Change web address" (mockup § 1, the popup): a choice before the store exists, so it saves nothing — it sets the
 *  address in the page. Esc, the ✕, the backdrop and Back keep the old one; focus returns to the button. */
export function AddressDialog({ open, current, shopDomain, onKeep, onUse }: {
  open: boolean; current: string; shopDomain: string; onKeep: () => void; onUse: (slug: string) => void
}) {
  const [draft, setDraft] = useState(current)
  // Each opening starts from the address the page holds now.
  useEffect(() => { if (open) setDraft(current) }, [open, current])
  const check = useAddressCheck(draft)
  const keep = () => { setDraft(current); onKeep() }
  // The popup is drawn in the console's look (mockup § 1: Neel's dialog and action colour), inside the brand page.
  return (
    <div data-neel>
    <Dialog open={open} onClose={keep} onDismiss={keep} title="Your web address"
      actions={<>
        <Button type="button" variant="secondary" data-autofocus onClick={keep}>Keep {current}</Button>
        <Button type="button" disabled={!check || !addressUsable(check.state)} onClick={() => onUse(draft)}>Use this address</Button>
      </>}>
      <div className="grid gap-1.5">
        <label htmlFor="su-slug" className="text-sm font-medium">Web address</label>
        <div className="su-slug">
          <input id="su-slug" className={`${FIELD} w-full font-mono`} value={draft} maxLength={30} autoComplete="off" spellCheck={false}
            aria-describedby="su-slug-line" onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))} />
          <span>.{shopDomain}</span>
        </div>
        <p id="su-slug-line" aria-live="polite" className={`su-line ${check?.state === 'ok' ? 'text-ok-text' : 'text-warn-text'}`}>{check ? addressLine(check.state) : ''}</p>
      </div>
    </Dialog>
    </div>
  )
}
