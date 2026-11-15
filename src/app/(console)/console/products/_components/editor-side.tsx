'use client'

import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { pick, urlFor } from '@/domains/media/sizes'
import { paise } from '@/domains/money/paise'
import { parseRupees } from '@/domains/money/rupees'
import { shareCard } from '@/domains/seo/defaults'
import { priceOf } from '@/domains/storefront/listing'
import type { Photo } from './photos'
import type { Cell } from './variant-grid'

/**
 * Shared on WhatsApp (Neel N2, mockup's side card): the link card as it will look, from the draft — before it is saved or
 * published (rework board). Its price is the buy box's (`priceOf`), as the real card is, never the editor's common price.
 * Drawn in the console's own tokens, not WhatsApp's colours.
 */
export function WhatsAppPreview({ title, description, cover, cells, host }: {
  title: string; description: string; cover: Photo | undefined; cells: Cell[]; host: string
}) {
  const price = priceOf({ variants: cells.map((c) => ({ price: parseRupees(c.price) ?? 0, compareAt: parseRupees(c.compareAt) })) })
  const card = shareCard(title || 'Product', description)
  return (
    <Section title="Shared on WhatsApp">
      <figure className="overflow-hidden rounded-md border border-border bg-sunk">
        {cover ? <img src={urlFor(cover.base, pick(cover.widths, 640))} alt="" width={320} height={168} className="aspect-[1.91] w-full object-cover" />
          : <span aria-hidden="true" className="block aspect-[1.91] w-full bg-line-soft" />}
        <figcaption className="space-y-0.5 p-3 text-sm">
          <p className="line-clamp-2 font-medium">{card.title}{price ? <> · <Money paise={paise(price.min)} /></> : null}</p>
          <p className="line-clamp-2 text-small text-muted-foreground">{card.description}</p>
          <p className="truncate text-small text-muted-foreground">{host}</p>
        </figcaption>
      </figure>
    </Section>
  )
}
