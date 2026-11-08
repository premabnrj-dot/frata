'use client'

import type { ThemeSettings } from '@/domains/themes/types'
import { Choice, Offered, OfferedSwitch } from './controls'
import type { Choices } from '@/domains/themes/choices'

// The product page and collection page panels (themes T2, mockup board "Customizer · Product page"): what every page
// of that kind wears. Every default is what shops had before T2. Cards and columns show on every grid.

export function PageForm({ page, settings, choices, set }: { page: 'product' | 'collection'; settings: ThemeSettings; choices: Choices; set: (s: Partial<ThemeSettings>) => void }) {
  return (
    <div className="space-y-6">
      {page === 'product' ? <>
        <Offered label="Photos" value={settings.gallery} list={choices.gallery} onChange={(gallery) => set({ gallery })} all={[{ value: 'swipe', label: 'Two across' }, { value: 'stack', label: 'Stacked' }, { value: 'thumbs', label: 'Thumbnails under' }, { value: 'rail', label: 'Thumbnails beside' }]} />
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
