import type { ThemeManifest } from '../../types'
import { band, light, style } from '../kit'

// Bazaar 1.0.0 — category circles, price tiles, festive banners, for big catalogues.
const white = '#FFFFFF', ink = '#1A1714'
const bz = (accent: `#${string}`, tint: `#${string}`) => ({
  paper: light(white, ink, '#5E5650', '#E7E2DC', '#F5F0EA', accent),
  tint: light(tint, ink, '#54493E', '#EADBC2', '#FFF6E6', accent),
  ink: band(accent, white, '#F3E6E9', '#FFFFFF', '#FFFFFF', white, accent),
})

export const bazaar_1_0_0: ThemeManifest = {
  key: 'bazaar', version: '1.0.0', name: 'Bazaar',
  job: 'Category circles, price tiles, festive banners. For big catalogues.',
  goodFor: ['ethnic', 'women', 'men', 'kids', 'accessories'],
  features: ['Category circles under the header', 'A sale banner with a real end date', 'Price tiles: Under ₹999, Under ₹1,999', 'Best sellers, by delivered orders', '3 columns of products on a phone', 'Bottom tab bar: Home, Shop, Search, Bag'],
  styles: [
    style('sindoor', 'Sindoor', bz('#B3123F', '#FBEFD9'), { paper: 'White', tint: 'Marigold', ink: 'Sindoor' }),
    style('genda', 'Genda', bz('#9A4F00', '#FFF1D6'), { paper: 'White', tint: 'Cream', ink: 'Genda' }),
    style('mehndi', 'Mehndi', bz('#0E6E5C', '#E6F3EE'), { paper: 'White', tint: 'Mint', ink: 'Mehndi' }),
  ],
  defaults: {
    pairing: 'fraunces', headings: 'as_typed', size: 'regular', corners: 'soft', buttons: 'solid', spacing: 'compact', photo: '3:4',
    hoverPhoto: false, phoneColumns: 3, header: 'circles', sticky: true, bottomTabs: true, announcement: null, footer: 'three',
    social: true, motion: 'subtle', brandColour: null,
  },
  allowed: { pairings: ['fraunces', 'inter', 'dmserif'], headers: ['circles', 'classic'], footers: ['three', 'compact'], sections: ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos'] },
  home: [
    { id: 'sale', key: 'hero', layout: 'text', heading: { from: 'shopName' }, text: { from: 'tagline' }, height: 'short', scheme: 'ink' },
    { id: 'budget', key: 'price_tiles', heading: 'Shop by budget', bands: [{ minPaise: null, maxPaise: 99900 }, { minPaise: null, maxPaise: 199900 }] },
    { id: 'best', key: 'products', heading: 'Best sellers', source: { kind: 'best_sellers', days: 30 }, count: 12, layout: 'grid' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 12, layout: 'grid' },
    { id: 'promise', key: 'promises', show: ['cod', 'returns', 'free_shipping'], scheme: 'tint' },
  ],
}
