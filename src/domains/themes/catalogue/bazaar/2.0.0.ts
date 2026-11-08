import type { ThemeManifest } from '../../types'
import { bazaar_1_0_0 } from './1.0.0'

// Bazaar 2.0.0 — big catalogues, sale-ready (plan 2026-11-09-themes-three). Everything a shopper with many pieces
// to scan needs close to the thumb: category circles, bottom tabs, three across on a phone, framed cards that lift,
// thumbnails under the photo, and an Add to bag bar that follows the shopper down the page. Pill buttons that
// press. Built on 1.0's styles.
export const bazaar_2_0_0: ThemeManifest = {
  key: 'bazaar', version: '2.0.0', name: 'Bazaar',
  job: 'Big catalogues and sales. Quick to scan, quick to buy.',
  goodFor: ['ethnic', 'women', 'men', 'kids', 'accessories', 'sarees'],
  features: [
    'Category circles under the header and tabs at the bottom',
    'Three pieces across on a phone, framed cards',
    'An Add to bag bar that stays at hand on phones',
    'Price tiles: Under ₹999, Under ₹1,999',
    'Best sellers, by delivered orders',
    'Round pill buttons',
  ],
  styles: [...bazaar_1_0_0.styles],
  defaults: {
    pairing: 'fraunces', headings: 'as_typed', size: 'regular', corners: 'soft', buttons: 'solid', spacing: 'compact', photo: '3:4',
    hoverPhoto: false, phoneColumns: 3, header: 'circles', sticky: true, bottomTabs: true, announcement: null, footer: 'three',
    social: true, motion: 'subtle', brandColour: null,
    gallery: 'thumbs', details: 'folded', card: 'framed', desktopColumns: 4, collectionTop: 'banner',
    buttonShape: 'pill', buttonMotion: 'press', cardHover: 'lift', entrance: 'none', reveal: false, buyBoxSticky: false, buyBar: true,
    footerScheme: 'tint', checkout: 'standard',
  },
  allowed: {
    pairings: ['fraunces', 'inter', 'dmserif'], headers: ['circles', 'classic', 'split'], footers: ['three', 'compact'],
    sections: [...bazaar_1_0_0.allowed.sections],
    choices: {
      buttons: ['solid', 'outline'], gallery: ['thumbs', 'swipe', 'rail'], buttonShape: ['pill', 'theme'], buttonMotion: ['press', 'lift'],
      cardHover: ['lift', 'none'], entrance: ['none', 'fade'], reveal: [false], buyBoxSticky: [false, true], buyBar: [true, false],
      footerScheme: ['tint', 'paper', 'ink'], checkout: ['standard', 'focused'],
    },
  },
  samples: true, rhythm: 'even',
  home: [
    { id: 'sale', key: 'hero', layout: 'text', heading: { from: 'shopName' }, text: { from: 'tagline' }, height: 'short', scheme: 'ink' },
    { id: 'tiles', key: 'collection_tiles', heading: 'Shop by category', mode: 'auto', count: 6, shape: 'portrait' },
    { id: 'budget', key: 'price_tiles', heading: 'Shop by budget', bands: [{ minPaise: null, maxPaise: 99900 }, { minPaise: null, maxPaise: 199900 }] },
    { id: 'best', key: 'products', heading: 'Best sellers', source: { kind: 'best_sellers', days: 30 }, count: 12, layout: 'grid' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 12, layout: 'rail' },
    { id: 'promise', key: 'promises', show: ['cod', 'returns', 'free_shipping'], scheme: 'tint' },
  ],
}
