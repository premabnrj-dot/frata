'use client'

import { cn } from '@/lib/utils'
import { HEADING, LONGEST, PARTS, PRODUCTS, SITE, STRIP, CLIENT, type Case, type Part } from './fixtures'

// The fixture store inside the preview (mockup screen 1 `.dev`): the strip, the header, the hero, New in and three
// products, in the store's own colours (data, from its brand record). It is the store, so it sits in
// [data-store-theme]: no Neel rule reaches it. A part a person can pick (the hero, New in) is a button; the picked one
// wears the focus colour's outline (--pick, resolved on the frame outside the store). WB·4 replaces this with the session's real preview.

const SERIF = 'Georgia, serif'

export function FixtureSite({ shown, picked, onPick }: { shown: Case; picked: Part | null; onPick: (p: Part) => void }) {
  const part = (p: Part) => ({
    role: 'button' as const, tabIndex: 0, 'aria-pressed': picked === p, 'data-part': p,
    onClick: () => onPick(p),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p) } },
    className: cn('cursor-pointer outline-offset-[3px] outline-[var(--pick)] hover:outline hover:outline-1 hover:outline-dashed', picked === p && 'outline outline-2 hover:outline-solid hover:outline-2'),
  })
  return (
    <div data-store-theme="" style={{ background: SITE.paper, color: SITE.ink }} className="text-sm">
      <div style={{ background: SITE.ink, color: SITE.paper }} className="px-2 py-1.5 text-center text-small">{STRIP}</div>
      <header className="flex items-center justify-between px-3.5 py-3">
        <span style={{ fontFamily: SERIF }} className="text-section font-semibold tracking-wide">{CLIENT}</span>
        <span className="text-small font-medium">Bag</span>
      </header>
      <div {...part('hero')} style={{ background: `linear-gradient(160deg, ${SITE.hero[0]}, ${SITE.hero[1]} 70%, ${SITE.hero[2]})`, color: SITE.onHero }}
        className={cn(part('hero').className, 'mx-3.5 grid min-h-52 content-end rounded-sm p-4')}>
        <h2 style={{ fontFamily: SERIF }} className="text-title font-semibold">{shown === 'long' ? LONGEST : HEADING}<span className="sr-only">{PARTS.hero.more}</span></h2>
      </div>
      {shown === 'empty'
        ? <p style={{ borderColor: SITE.soft }} className="m-3.5 rounded-sm border border-dashed p-5 text-center text-label">No products yet</p>
        : <>
            <h3 {...part('newin')} style={{ fontFamily: SERIF }} className={cn(part('newin').className, 'mx-3.5 mt-4 mb-2 text-section font-semibold')}>New in<span className="sr-only">{PARTS.newin.more}</span></h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(86px,1fr))] gap-2 px-3.5 pb-4">
              {PRODUCTS.map((p) => (
                <li key={p.name} className="grid gap-0.5 text-small">
                  <span aria-hidden="true" style={{ background: p.swatch }} className="aspect-[3/4] rounded-xs" />
                  {p.name}
                  {shown === 'soldout' && p.soldOut ? <span className="font-medium">Sold out</span> : <span className="tabular-nums">{p.price}</span>}
                </li>
              ))}
            </ul>
          </>}
    </div>
  )
}
