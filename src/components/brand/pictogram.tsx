import type { ReactNode } from 'react'

// =============================================================================
// FILE: src/components/brand/pictogram.tsx — Frrata's pictograms.
//
// frata-design-language § Graphic language. One drawing rule for all of them:
// a 48 grid with a 4 px margin, a 2 px ink line with round caps and joins, paper
// inside, at most ONE accent shape (haldi) and one warm fill. No gradients,
// shadows or oxblood. Always aria-hidden: the words beside them carry the meaning.
// UI icons stay lucide (§ UX foundation rule 20); these are for the website,
// empty states on the partner surface and the illustrations built from them.
// =============================================================================

export const PICTOGRAMS = ['store', 'build', 'handover', 'earn', 'delivered', 'clients', 'owner', 'calendar', 'shield', 'apply'] as const
export type PictogramName = (typeof PICTOGRAMS)[number]

const line = 'stroke-illo-line'
const L = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', className: line } as const

const DRAW: Record<PictogramName, ReactNode> = {
  // A shopfront with a striped awning.
  store: (<>
    <rect x="9" y="20" width="30" height="20" rx="2" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <path d="M7 20l3-10h28l3 10z" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} strokeLinejoin="round" />
    <path d="M17 10l-2 10M24 10v10M31 10l2 10" {...L} />
    <rect x="20" y="29" width="8" height="11" rx="1" className="fill-illo-fill stroke-illo-line" strokeWidth={2} />
  </>),
  // A window being laid out: blocks on a grid.
  build: (<>
    <rect x="7" y="9" width="34" height="30" rx="3" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <path d="M7 16h34" {...L} />
    <rect x="12" y="21" width="11" height="13" rx="1.5" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <path d="M28 22h8M28 28h8M28 34h5" {...L} />
  </>),
  // A key passing from one hand to the next.
  handover: (<>
    <path d="M5 30h9l6 4h8a3 3 0 0 0 0-6h-5" {...L} />
    <path d="M43 30h-9l-4-3" {...L} />
    <circle cx="24" cy="14" r="5" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <path d="M24 19v8M24 23h3" {...L} />
  </>),
  // A coin over rising bars.
  earn: (<>
    <path d="M9 40V30M18 40V24M27 40V18" {...L} strokeWidth={4} />
    <circle cx="35" cy="14" r="8" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <text x="35" y="18.5" textAnchor="middle" fontSize="12" fontWeight="700" className="fill-illo-line">₹</text>
    <path d="M6 40h36" {...L} />
  </>),
  // A parcel with a tick.
  delivered: (<>
    <path d="M8 16l16-8 16 8v18l-16 8-16-8z" className="fill-illo-fill stroke-illo-line" strokeWidth={2} strokeLinejoin="round" />
    <path d="M8 16l16 8 16-8M24 24v18" {...L} />
    <circle cx="36" cy="34" r="7" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <path d="M33 34l2 2 4-4" {...L} />
  </>),
  // Several stores in one place.
  clients: (<>
    <rect x="6" y="8" width="16" height="14" rx="2" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <rect x="26" y="8" width="16" height="14" rx="2" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <rect x="6" y="26" width="16" height="14" rx="2" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <rect x="26" y="26" width="16" height="14" rx="2" className="fill-illo-fill stroke-illo-line" strokeWidth={2} />
  </>),
  // A person holding the key: the brand's owner.
  owner: (<>
    <circle cx="20" cy="15" r="6" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <path d="M8 40c0-7 5-12 12-12s12 5 12 12" className="fill-illo-fill stroke-illo-line" strokeWidth={2} strokeLinejoin="round" />
    <circle cx="36" cy="24" r="4" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <path d="M36 28v10M36 34h3" {...L} />
  </>),
  // A calendar page: time on the share.
  calendar: (<>
    <rect x="8" y="11" width="32" height="29" rx="3" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <path d="M8 19h32" {...L} />
    <path d="M16 7v7M32 7v7" {...L} />
    <rect x="14" y="25" width="8" height="8" rx="1.5" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
  </>),
  // The brand keeps its store: a shield.
  shield: (<>
    <path d="M24 6l15 5v11c0 10-7 17-15 20-8-3-15-10-15-20V11z" className="fill-illo-fill stroke-illo-line" strokeWidth={2} strokeLinejoin="round" />
    <path d="M17 24l5 5 9-10" {...L} />
  </>),
  // A form being sent.
  apply: (<>
    <rect x="9" y="7" width="24" height="32" rx="2" className="fill-illo-paper stroke-illo-line" strokeWidth={2} />
    <path d="M14 15h14M14 21h14M14 27h8" {...L} />
    <circle cx="35" cy="34" r="7" className="fill-illo-haldi stroke-illo-line" strokeWidth={2} />
    <path d="M32 34h6M36 31l3 3-3 3" {...L} />
  </>),
}

/** A Frrata pictogram. `size` in px (48 is its drawn size; 32 and 64 also hold the 2 px line well). */
export function Pictogram({ name, size = 48, className }: { name: PictogramName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 48 48" className={className}>
      {DRAW[name]}
    </svg>
  )
}
