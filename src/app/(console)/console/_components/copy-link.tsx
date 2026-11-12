'use client'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/** The shop's address with Copy link; if the clipboard is refused, the address is selected to copy by hand. */
export function CopyLink({ address }: { address: string }) {
  const toast = useToast()
  const url = `https://${address}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code id="shop-address" className="rounded-sm bg-muted px-2 py-1 font-mono text-sm">{address}</code>
      <Button variant="secondary" onClick={() => (navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('no clipboard'))).then(() => toast.ok('Copied.'), () => {
        const r = document.createRange(); r.selectNodeContents(document.getElementById('shop-address')!); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
        toast.error('Selected: copy it with your keyboard.')
      })}>Copy link</Button>
    </div>
  )
}
