'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Button, button } from '@/components/ui/button'
import type { Outcome } from '@/lib/catalogue/import-drafts'
import { publishImportReady } from '../actions'
import { Bar, Count, Counts } from './parts'

/** Step 3 (mockup view 3 · Done): what was added, and what each draft still needs, each with its button. */
export function DoneStep({ jobId, added, leftOut, inShop, outcome, onFix }: {
  jobId: string; added: number; leftOut: number; inShop: number; outcome: Outcome | null; onFix: (() => void) | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const toast = useToast()
  const publish = () => start(async () => {
    const r = await publishImportReady(jobId)
    if (r.ok) toast({ text: r.published === 1 ? '1 product is live' : `${r.published} products are live` }); else toast.error(r.error)
    router.refresh()
  })
  const ready = outcome?.ready.length ?? 0
  return (
    <>
      <Section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <b className="text-base">{added === 1 ? '1 product added as a draft' : `${added.toLocaleString('en-IN')} products added as drafts`}</b>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {inShop > 0 && <span><span className="font-mono tabular-nums">{inShop}</span> already in your shop</span>}
            {leftOut > 0 && <span><span className="font-mono tabular-nums">{leftOut}</span> left out</span>}
            {leftOut > 0 && onFix && <Button variant="ghost" onClick={onFix}>Download rows to fix</Button>}
          </span>
        </div>
        <Bar done={1} total={1} label="Import done" />
      </Section>
      {outcome && outcome.drafts > 0 && (
        <Counts label="What the drafts need">
          <Count value={outcome.needPhotos} label="Need photos">
            {outcome.needPhotos > 0 && <Link href="/console/products/photos?from=import" className={button({ variant: 'secondary' })}>Add photos</Link>}
          </Count>
          <Count value={ready} label="Ready to go live">
            {ready > 0 && <Button variant="secondary" onClick={publish} disabled={pending}>{ready === 1 ? 'Publish the 1 ready' : `Publish the ${ready} ready`}</Button>}
          </Count>
          <Count value={outcome.needGst} label="Need a GST rate">
            {outcome.needGst > 0 && <Link href="/console/products/tax" className={button({ variant: 'secondary' })}>Set rates</Link>}
          </Count>
        </Counts>
      )}
    </>
  )
}
