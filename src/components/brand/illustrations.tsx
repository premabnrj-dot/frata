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

/** A pictogram on its tile: the one way a pictogram sits in a card, a step or an empty state. */
export function PictoTile({ name, tone = 'paper' }: { name: PictogramName; tone?: 'paper' | 'haldi' | 'indigo' }) {
  const bg = tone === 'haldi' ? 'bg-illo-haldi-soft' : tone === 'indigo' ? 'bg-illo-indigo-soft' : 'bg-illo-fill'
  return <span aria-hidden="true" className={`inline-grid size-16 shrink-0 place-items-center rounded-xl ${bg}`}><Pictogram name={name} size={40} /></span>
}
