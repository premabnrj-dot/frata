'use client'

import type { ThemeSettings } from '@/domains/themes/types'
import { Choice, Offered, OfferedSwitch, Tiles } from './controls'
import type { Choices } from '@/domains/themes/choices'

// The page panels (themes T2; Look v4 page-aware: mockup board "Page options"): what every page of that kind wears,
// from what the theme offers. Every default is what shops had before T2. Cards and columns show on every grid. Bag
// and Checkout hold money: one well-tested layout each for every theme, styled by Site settings (owner 2026-11-09).

type Page = 'product' | 'collection' | 'all' | 'bag' | 'checkout'
export function PageForm({ page, settings, choices, set, openSite }: { page: Page; settings: ThemeSettings; choices: Choices; set: (s: Partial<ThemeSettings>) => void; openSite: () => void }) {
  const site = <button type="button" onClick={openSite} className="flex min-h-10 w-full items-center justify-between rounded-md border border-input px-3 text-sm">Colours, text and icons<span aria-hidden="true">›</span></button>
  if (page === 'bag') return <div className="space-y-6">{site}</div>
  if (page === 'checkout') return (
    <div className="space-y-6">
      <Offered label="Checkout" value={settings.checkout} list={choices.checkout} onChange={(checkout) => set({ checkout })} all={[{ value: 'standard', label: 'With your menu' }, { value: 'focused', label: 'Focused' }]} />
      {site}
    </div>
  )
  return (
    <div className="space-y-6">
      {page === 'all' ? null : page === 'product' ? <>
        <Tiles label="Photos" cols={2} value={settings.gallery} onChange={(gallery) => set({ gallery })}
          options={(choices.gallery ?? ['swipe', 'thumbs', 'rail', 'stack']).map((v) => ({ value: v, label: GALLERY_NAMES[v], picture: <GalleryPicture v={v} /> }))} />
        <OfferedSwitch label="Buy box stays beside the photos (computers)" on={settings.buyBoxSticky} list={choices.buyBoxSticky} onChange={(buyBoxSticky) => set({ buyBoxSticky })} />
        <OfferedSwitch label="Add to bag bar on phones" on={settings.buyBar} list={choices.buyBar} onChange={(buyBar) => set({ buyBar })} />
        <Choice label="About and details" value={settings.details} onChange={(details) => set({ details })} options={[{ value: 'open', label: 'Open' }, { value: 'folded', label: 'Folded' }]} />
      </> : <>
        <Choice label="Top of the page" value={settings.collectionTop} onChange={(collectionTop) => set({ collectionTop })} options={[{ value: 'title', label: 'Title' }, { value: 'banner', label: 'Banner' }]} />
        <p className="text-xs text-muted-foreground">Banner uses the collection’s first piece’s photo. With no photo, the title shows.</p>
      </>}
      <h3 className="pt-2 text-sm font-semibold">Product cards (every grid)</h3>
      <Choice label="Card" value={settings.card} onChange={(card) => set({ card })} options={[{ value: 'standard', label: 'Standard' }, { value: 'centred', label: 'Centred' }, { value: 'framed', label: 'Framed' }]} />
      <Choice label="Columns on a computer" value={settings.desktopColumns} onChange={(desktopColumns) => set({ desktopColumns })} options={[{ value: 4, label: '4' }, { value: 3, label: '3' }]} />
      <p className="text-xs text-muted-foreground">Reviews, size help and offers appear in their places when you turn them on in Apps and Offers.</p>
    </div>
  )
}

const GALLERY_NAMES = { swipe: 'Two across', stack: 'Stacked', thumbs: 'Thumbnails under', rail: 'Thumbnails beside' } as const
/** Each product-photo layout, drawn: photos in grey, the buy box in ink (decorative). */
function GalleryPicture({ v }: { v: keyof typeof GALLERY_NAMES }) {
  const r = (x: number, y: number, w: number, h: number, o = 0.3, k?: string) => <rect key={k ?? `${x}${y}${w}${h}`} x={x} y={y} width={w} height={h} rx={1.5} fill="currentColor" opacity={o} />
  const box = <>{r(76, 6, 36, 5, 0.8)}{r(76, 15, 24, 3, 0.5)}{r(76, 26, 36, 7, 0.9)}</>
  const b = {
    swipe: <>{r(6, 4, 64, 22)}{r(6, 28, 31, 14)}{r(39, 28, 31, 14)}{box}</>,
    stack: <>{r(6, 4, 64, 18)}{r(6, 24, 64, 18)}{box}</>,
    thumbs: <>{r(6, 4, 64, 28)}{[0, 1, 2, 3].map((i) => r(6 + i * 16.5, 34, 14, 8, 0.45, `t${i}`))}{box}</>,
    rail: <>{[0, 1, 2].map((i) => r(6, 4 + i * 13, 10, 11, 0.45, `t${i}`))}{r(19, 4, 51, 38)}{box}</>,
  }[v]
  return <svg viewBox="0 0 118 46" className="h-11 w-full text-foreground" aria-hidden="true">{b}</svg>
}
