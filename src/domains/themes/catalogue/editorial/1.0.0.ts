import type { ThemeManifest } from '../../types'
import { dark, light, style } from '../kit'

// Editorial 1.0.0 — big photos, serif type, for designer ethnic wear (themes spec § The five themes).
const cream = '#F6F1E8', ink = '#1F1A17'
const ed = (accent: `#${string}`, tint: `#${string}`, glow: `#${string}`) => ({
  paper: light(cream, ink, '#5C5046', '#E3D9C9', '#EFE6D8', accent),
  tint: light(tint, ink, '#4F4234', '#DCCBB0', '#F1E4CB', accent),
  ink: dark(ink, cream, '#CFC4B6', '#3A322C', '#2A231E', glow, ink),
})

export const editorial_1_0_0: ThemeManifest = {
  key: 'editorial', version: '1.0.0', name: 'Editorial',
  job: 'Big photos, serif type. For designer ethnic wear.',
  goodFor: ['ethnic', 'women', 'designer'],
  features: ['A full-bleed hero photo', 'Centred logo with a menu', 'Best sellers by delivered orders', 'Shop by promise from your settings', 'Your brand story beside a photo', 'Square corners, airy spacing'],
  styles: [
    style('haldi', 'Haldi', ed('#9A5B0C', '#F3E3C3', '#E3A84A'), { paper: 'Paper', tint: 'Haldi', ink: 'Ink' }),
    style('indigo', 'Indigo', ed('#2F3E73', '#E3E6F2', '#9DAEEA'), { paper: 'Paper', tint: 'Indigo', ink: 'Ink' }),
    style('rose', 'Rose', ed('#9B3550', '#F4E0E3', '#EE9DB0'), { paper: 'Paper', tint: 'Rose', ink: 'Ink' }),
  ],
  defaults: {
    pairing: 'cormorant', headings: 'as_typed', size: 'large', corners: 'square', buttons: 'solid', spacing: 'airy', photo: '4:5',
    hoverPhoto: true, phoneColumns: 2, header: 'centred', sticky: true, bottomTabs: false, announcement: null, footer: 'three',
    social: true, motion: 'subtle', brandColour: null,
  },
  allowed: { pairings: ['cormorant', 'playfair', 'dmserif', 'fraunces'], headers: ['centred', 'classic', 'minimal'], footers: ['three', 'compact'], sections: ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos'] },
  home: [
    { id: 'hero', key: 'hero', layout: 'image_text', heading: { from: 'shopName' }, text: { from: 'tagline' }, height: 'tall' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 8, layout: 'grid' },
    { id: 'promise', key: 'promises', show: ['cod', 'returns', 'dispatch'], scheme: 'tint' },
    { id: 'best', key: 'products', heading: 'Best sellers', source: { kind: 'best_sellers', days: 90 }, count: 4, layout: 'grid' },
    { id: 'story', key: 'image_text', heading: 'Our story', text: '', side: 'left' },
  ],
}
