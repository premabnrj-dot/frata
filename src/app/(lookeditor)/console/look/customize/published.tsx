'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, button } from '@/components/ui/button'
import { undoPublishAction } from '@/app/(console)/console/look/actions'

/** After Publish (mockup "Publish": "Published. Shoppers see it on their next visit. View your shop. Undo"). */
export function Published({ undoFrom }: { undoFrom: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <section aria-labelledby="pub-h" className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
        <h1 id="pub-h" className="text-xl font-semibold">Published</h1>
        <p className="text-sm text-muted-foreground">Shoppers see it on their next visit. Your earlier look is in History.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/console/look" className={button()}>Back to Look</Link>
          <a href="/console/preview" className={button({ variant: 'secondary' })}>View your shop</a>
          {undoFrom && <Button variant="secondary" className="after:hidden" disabled={pending} onClick={() => start(async () => { const r = await undoPublishAction({ live: undoFrom }); if (!r.ok) setError(r.error); else router.push('/console/look') })}>Undo</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </section>
    </main>
  )
}
