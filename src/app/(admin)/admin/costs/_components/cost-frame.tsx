'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { QuickLook } from '@/components/data/quick-look'
import { button } from '@/components/ui/button'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/_components/cost-frame.tsx — A COST BESIDE ITS LIST (mockup § All costs). From 768 px the
// shared QuickLook (it takes focus, closes on Esc, ↑ ↓ move to the next cost, the list stays usable: the one deviation from
// the drawn scrim, in the plan's table); on a phone the cost is a page of its own with a way back, as drawn.
// =============================================================================

export function CostFrame({ title, closeHref, prevHref, nextHref, children, footer }: {
  title: string; closeHref: string; prevHref?: string; nextHref?: string; children: ReactNode; footer: ReactNode
}) {
  const router = useRouter()
  const move = (by: 1 | -1) => { const to = by === 1 ? nextHref : prevHref; if (to) router.push(to) }
  return (
    <>
      <section aria-label={title} className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-4 md:hidden">
        <header className="flex items-center gap-2"><h2 className="min-w-0 flex-1 truncate text-section font-semibold">{title}</h2><Link href={closeHref} className={button({ variant: 'ghost', size: 'sm' })} aria-label="Close cost">Close</Link></header>
        {children}
        <footer className="flex flex-wrap items-center gap-2">{footer}</footer>
      </section>
      <QuickLook title={title} onClose={() => router.push(closeHref)} onMove={move} footer={<div className="flex w-full flex-wrap items-center gap-2">{footer}</div>}>
        <div className="flex flex-col gap-4">{children}</div>
      </QuickLook>
    </>
  )
}
