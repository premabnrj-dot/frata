import { Pictogram, type PictogramName } from './pictogram'

// =============================================================================
// FILE: src/components/brand/illustrations.tsx — Frrata's spot illustrations.
//
// frata-design-language § Graphic language: built from the pictograms' own
// drawing rule (2 px ink line, paper, one warm fill, haldi as the one accent),
// so a page never mixes two styles. Composed flat, no perspective, no people's
// faces, no stock art. aria-hidden: each sits beside words that say the same.
// =============================================================================

/** The partner's model in one picture: you → a store you build → the brand owns it → a share comes back. */
export function PartnerLoop({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 480 320" className={className}>
      <rect x="1" y="1" width="478" height="318" rx="16" className="fill-illo-haldi-soft" />
      {/* the loop */}
      <path d="M118 112C170 60 310 60 362 112" fill="none" strokeWidth={2} strokeDasharray="6 8" strokeLinecap="round" className="stroke-illo-line" />
      <path d="M362 208C310 260 170 260 118 208" fill="none" strokeWidth={2} strokeDasharray="6 8" strokeLinecap="round" className="stroke-illo-line" />
      <path d="M354 100l10 12-15 3" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-illo-line" />
      <path d="M126 220l-10-12 15-3" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-illo-line" />
      {/* you, building */}
      <g transform="translate(40 108)"><rect width="104" height="104" rx="14" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><g transform="translate(20 20)"><Pictogram name="build" size={64} /></g></g>
      {/* the brand's store, handed over */}
      <g transform="translate(336 108)"><rect width="104" height="104" rx="14" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><g transform="translate(20 20)"><Pictogram name="store" size={64} /></g></g>
      {/* key on the top arc, rupee on the bottom arc */}
      <g transform="translate(216 44)"><circle cx="24" cy="24" r="26" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><Pictogram name="handover" size={48} /></g>
      <g transform="translate(216 228)"><circle cx="24" cy="24" r="26" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><Pictogram name="earn" size={48} /></g>
    </svg>
  )
}

/** A shopper's journey in one picture: sees the store, pays, the order arrives. */
export function BuyerJourney({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 480 220" className={className}>
      <rect x="1" y="1" width="478" height="218" rx="16" className="fill-illo-haldi-soft" />
      <path d="M118 110h244" fill="none" strokeWidth={2} strokeDasharray="6 8" strokeLinecap="round" className="stroke-illo-line" />
      <path d="M352 104l10 6-10 6" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-illo-line" />
      <g transform="translate(40 62)"><rect width="96" height="96" rx="14" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><g transform="translate(24 24)"><Pictogram name="store" size={48} /></g></g>
      <g transform="translate(192 62)"><rect width="96" height="96" rx="14" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><g transform="translate(24 24)"><Pictogram name="payments" size={48} /></g></g>
      <g transform="translate(344 62)"><rect width="96" height="96" rx="14" className="fill-illo-paper stroke-illo-line" strokeWidth={2} /><g transform="translate(24 24)"><Pictogram name="delivered" size={48} /></g></g>
    </svg>
  )
}

/** A pictogram on its tile: the one way a pictogram sits in a card, a step or an empty state. `sm`: 44 px, radius 10,
 *  the pictogram at 28 — a setup popup's header (Dialog's `picto`, O2a·4). */
export function PictoTile({ name, tone = 'paper', size = 'md' }: { name: PictogramName; tone?: 'paper' | 'haldi' | 'indigo'; size?: 'md' | 'sm' }) {
  const bg = tone === 'haldi' ? 'bg-illo-haldi-soft' : tone === 'indigo' ? 'bg-illo-indigo-soft' : 'bg-illo-fill'
  const box = size === 'sm' ? 'size-11 rounded-[10px]' : 'size-16 rounded-xl'
  return <span aria-hidden="true" data-picto="" className={`inline-grid ${box} shrink-0 place-items-center ${bg}`}><Pictogram name={name} size={size === 'sm' ? 28 : 40} /></span>
}
