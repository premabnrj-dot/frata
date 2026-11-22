import type { TrustBlock, TrustKey } from '@/domains/brand/checkout'

// =============================================================================
// FILE: src/components/storefront/trust-blocks.tsx — A CODE-SITE STORE'S TRUST BLOCKS AT CHECKOUT (one-address plan
// P2·3; mockup docs/mockups/2026-11-16-p2-checkout.html screen 2). Up to four, in the partner's order, each an icon and
// words derived from the store's settings (src/domains/brand/checkout.ts trustBlocks); never typed. Drawn on the server
// and handed to checkout as a node (no script for it): two across on a phone, four from 640 px (brand-css.ts). "Secure
// payment" hides itself while online payment isn't offered on this address (checkout's data-online).
// =============================================================================

const ICON: Record<TrustKey, React.ReactNode> = {
  delivery: <><path d="M2.5 6.5h11v10h-11z" /><path d="M13.5 9.5h4l3 3.5v3.5h-7" /><circle cx="6.5" cy="17.5" r="1.75" /><circle cx="17" cy="17.5" r="1.75" /></>,
  returns: <><path d="M4 9.5h11a5 5 0 0 1 0 10H9" /><path d="M8 5.5 4 9.5l4 4" /></>,
  cod: <><rect x="2.5" y="6" width="19" height="12" rx="1" /><path d="M9.5 9.5h5M9.5 12h5M11 9.5c2.2 0 2.2 2.5 0 2.5l3 3" /></>,
  secure: <><rect x="5" y="10.5" width="14" height="10" rx="1" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  gst: <><path d="M6 3.5h8.5L18 7v13.5H6z" /><path d="M14 3.5V7h4M9 12h6M9 15.5h6" /></>,
}

export function TrustBlocks({ blocks }: { blocks: readonly TrustBlock[] }) {
  if (!blocks.length) return null
  return (
    <ul className="bf-trust" data-trust="">
      {blocks.map((b) => <li key={b.key} data-trust-key={b.key}><svg viewBox="0 0 24 24" aria-hidden="true" className="bf-ic">{ICON[b.key]}</svg><span>{b.words}</span></li>)}
    </ul>
  )
}
