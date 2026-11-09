import type { ThemeManifest } from '../../types'
import { dark, light, style } from '../kit'
import { minimal_1_0_0 } from './1.0.0'

// Studio 2.0.0 (Minimal renamed; the key stays `minimal`, so a shop on Minimal 1.0 moves by Try) — contemporary,
// western and basics (plan 2026-11-09-themes-three). Type and space do the work: uppercase Inter, the split header,
// underlined words for buttons, two photos across on the product page beside a buy box that stays, a page that
// rises in, a statement footer in black, a focused checkout. Ink and Paper from 1.0, and Olive.
export const minimal_2_0_0: ThemeManifest = {
  key: 'minimal', version: '2.0.0', name: 'Studio',
  job: 'Contemporary, western and basics. Clean type, quiet space.',
  goodFor: ['men', 'women', 'basics', 'streetwear', 'western'],
  features: [
    'Split header: your collections left, your name centred',
    'Uppercase type, square corners, underlined buttons',
    'Product photos two across, the buy box beside them as you scroll',
    'An Add to bag bar that stays at hand on phones',
    'Pages that rise in; a statement footer in black',
    'A focused checkout',
  ],
  styles: [
    ...minimal_1_0_0.styles,
    style('olive', 'Olive', {
      paper: light('#F3F2EC', '#191A14', '#4C4E43', '#DEDDD3', '#E9E8DF', '#4A5530'),
      tint: light('#E4E6D6', '#191A14', '#454839', '#D2D5C2', '#F3F2EC', '#4A5530'),
      ink: dark('#232619', '#F3F2EC', '#C5C7B8', '#3A3E2C', '#2C3020', '#D6DFB0', '#232619'),
    }, { paper: 'Paper', tint: 'Sage', ink: 'Olive' }),
  ],
  defaults: {
    pairing: 'inter', headings: 'upper', size: 'regular', corners: 'square', buttons: 'underline', spacing: 'regular', photo: '3:4',
    hoverPhoto: true, phoneColumns: 2, header: 'split', sticky: true, bottomTabs: false, announcement: null, footer: 'statement',
    social: true, motion: 'subtle', brandColour: null,
    gallery: 'swipe', details: 'folded', card: 'standard', desktopColumns: 4, collectionTop: 'title',
    buttonShape: 'theme', buttonMotion: 'lift', cardHover: 'none', entrance: 'rise', reveal: true, buyBoxSticky: true, buyBar: true,
    footerScheme: 'ink', checkout: 'focused',
  },
  allowed: {
    pairings: ['inter', 'dmserif'], headers: ['split', 'minimal', 'classic'], footers: ['statement', 'compact'],
    sections: [...minimal_1_0_0.allowed.sections],
    choices: {
      corners: ['square', 'soft'], buttons: ['underline', 'outline', 'solid'], buttonShape: ['theme'],
      gallery: ['swipe', 'stack', 'rail'], buttonMotion: ['lift', 'press', 'fill'], cardHover: ['none', 'zoom'],
      entrance: ['rise', 'fade', 'none'], reveal: [true, false], buyBoxSticky: [true, false], buyBar: [true, false],
      footerScheme: ['ink', 'paper'], checkout: ['focused', 'standard'],
    },
  },
  samples: 'studio', rhythm: 'even',
  home: [
    { id: 'hero', key: 'hero', layout: 'image', heading: { from: 'shopName' }, height: 'tall' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 8, layout: 'grid' },
    { id: 'tiles', key: 'collection_tiles', heading: 'Shop by', mode: 'auto', count: 4, shape: 'square' },
    { id: 'best', key: 'products', heading: 'Best sellers', source: { kind: 'best_sellers', days: 30 }, count: 8, layout: 'rail' },
  ],
}
