import { EkMark } from '@/components/ekcode/mark'
import { EK } from '@/domains/ekcode-core/brand'
import { ekcodeConfigured } from '@/lib/ekcode/keys'
import { EkcodeIslandLazy as EkcodeIsland } from './island-lazy'

// =============================================================================
// FILE: src/components/modules/ekcode/checkout-identity.tsx — "Continue with EkCode" on a shop's checkout (slot
// checkout.identity; approved mockup v4). The button is a plain link rendered here into the cached page — the mark's
// paths never ship as script (speed review H1). The island only decides the 1-in-10 holdout and, for a signed-in
// shopper, loads the filled strip as its own chunk.
// =============================================================================

export function EkcodeCheckout() {
  if (!ekcodeConfigured()) return null
  return (
    <EkcodeIsland mark={<EkMark height={15} tone="ink" />}>
      <a href="/api/shop/ekcode/start" rel="nofollow"
        className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-[var(--ek-ink)] px-5 text-[15px] font-medium text-[var(--ek-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ek-ink)]">
        <span>{EK.continueWith}</span>
        <EkMark height={22} tone="paper" />
      </a>
    </EkcodeIsland>
  )
}
