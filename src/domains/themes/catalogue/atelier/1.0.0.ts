import type { ThemeManifest } from '../../types'
import { band, light, style } from '../kit'

// Atelier 1.0.0 — the craft and the maker first, for made-to-order and bridal.
const at = (accent: `#${string}`, glow: `#${string}`) => ({
  paper: light('#EFE8DC', '#1F2A22', '#4E5547', '#DDD3C2', '#E7DECE', accent, '#EFE8DC'),
  tint: light('#E4DACA', '#1F2A22', '#47503F', '#D1C5B1', '#EFE8DC', accent, '#EFE8DC'),
  ink: band(accent, '#EFE8DC', '#D9D2C4', '#4A5A4E', '#2E4A38', glow, accent),
})

export const atelier_1_0_0: ThemeManifest = {
  key: 'atelier', version: '1.0.0', name: 'Atelier',
  job: 'The craft and the maker first. For made-to-order and bridal.',
  goodFor: ['bridal', 'made_to_order', 'ethnic', 'designer'],
  features: ['An arched photo beside your words', 'The maker’s story', 'How made to order works, in your words', 'One collection in focus', 'Round corners, airy spacing'],
  styles: [
    style('moss', 'Moss', at('#23402F', '#EFE8DC'), { paper: 'Linen', tint: 'Sand', ink: 'Moss' }),
    style('kattha', 'Kattha', at('#7A2E2E', '#F4DCD4'), { paper: 'Linen', tint: 'Sand', ink: 'Kattha' }),
  ],
  defaults: {
    pairing: 'fraunces', headings: 'as_typed', size: 'regular', corners: 'round', buttons: 'solid', spacing: 'airy', photo: '4:5',
    hoverPhoto: false, phoneColumns: 2, header: 'centred', sticky: false, bottomTabs: false, announcement: null, footer: 'three',
    social: true, motion: 'subtle', brandColour: null,
  },
  allowed: { pairings: ['fraunces', 'playfair', 'cormorant'], headers: ['centred', 'classic'], footers: ['three', 'compact'], sections: ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos'], heroMasks: ['none', 'arch'] },
  home: [
    { id: 'hero', key: 'hero', layout: 'split', heading: { from: 'shopName' }, text: { from: 'tagline' }, mask: 'arch', height: 'tall' },
    { id: 'maker', key: 'image_text', heading: 'The hands behind it', text: '', side: 'right' },
    { id: 'pieces', key: 'products', heading: 'The pieces', source: { kind: 'newest' }, count: 8, layout: 'grid' },
    { id: 'how', key: 'rich_text', heading: 'How made to order works', body: [[{ text: 'Pick your piece and your size. We make it for you and send it when it is ready.' }]], align: 'centre', scheme: 'tint' },
  ],
}
