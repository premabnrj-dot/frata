'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { Section } from '@/components/layout/section'

// =============================================================================
// FILE: src/app/(console)/console/_components/open-moment.tsx
//
// THE ONE BRAND MOMENT (frata-design-language rule 26): "Your shop is open", a check drawn once, only in the
// session of the person who opened it. Home swaps the checklist for Today when the shop opens, so the moment
// cannot live in the checklist: this provider wraps both and sits at the same place in the tree, and
// router.refresh() keeps its state (U·4 review). Nothing is stored, so nothing carries it to another shop.
// Its status region is always there (a region inserted with its text is often not read).
// =============================================================================

const Ctx = createContext<{ opened: () => void; closed: () => void } | null>(null)

/** For OpenShop: say the shop just opened, or closed again. Outside a provider it does nothing. */
export const useOpenMoment = () => useContext(Ctx)

/** `header` renders first, so the check lands under the page's title, not above it. */
export function OpenMoment({ address, header, children }: { address: string; header: React.ReactNode; children: React.ReactNode }) {
  const [just, setJust] = useState(false)
  const value = useMemo(() => ({ opened: () => setJust(true), closed: () => setJust(false) }), [])
  return (
    <Ctx.Provider value={value}>
      {header}
      <div role="status" className={just ? undefined : 'sr-only'}>
        {just && (
          <Section className="flex items-center gap-3 space-y-0">
            <svg viewBox="0 0 56 56" width="40" height="40" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-brand">
              <circle cx="28" cy="28" r="24" stroke="currentColor" pathLength={1} className="animate-draw-circle" />
              <path d="M18 29l7 7 13-15" stroke="currentColor" pathLength={1} className="animate-draw-tick" />
            </svg>
            <p className="text-sm"><b className="block font-display text-xl font-semibold tracking-tight">Your shop is open</b>Shoppers can order at <a href={`https://${address}`} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center font-mono underline">{address}</a></p>
          </Section>
        )}
      </div>
      {children}
    </Ctx.Provider>
  )
}
