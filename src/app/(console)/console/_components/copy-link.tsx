'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** The shop's address with Copy link; if the clipboard is refused, the address is selected to copy by hand. */
export function CopyLink({ address }: { address: string }) {
  const [said, setSaid] = useState('')
  const url = `https://${address}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code id="shop-address" className="rounded-sm bg-muted px-2 py-1 font-mono text-sm">{address}</code>
      <Button variant="secondary" onClick={() => navigator.clipboard.writeText(url).then(() => setSaid('Copied.'), () => {
        const r = document.createRange(); r.selectNodeContents(document.getElementById('shop-address')!); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
        setSaid('Selected: copy it with your keyboard.')
      })}>Copy link</Button>
      <span role="status" className="text-sm text-muted-foreground">{said}</span>
    </div>
  )
}
