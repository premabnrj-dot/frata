import type { ThemeManifest } from '../../types'
import { atelier_1_0_0 } from '../atelier/1.0.0'
import { editorial_1_1_0 } from './1.1.0'

// Editorial 2.0.0 — occasion and designer wear (plan 2026-11-09-themes-three). Takes in Atelier (its arched photo
// and its two styles), so one theme does what two did. Photos lead: stacked on the product page beside a buy box
// that stays in view; a sheen on buttons, photos that grow under the pointer, a page that fades in, sections that
// rise; a statement footer in ink; a focused checkout. Built on 1.1 and Atelier 1.0, never a copy of their colours.
export const editorial_2_0_0: ThemeManifest = {
  key: 'editorial', version: '2.0.0', name: 'Editorial',
  job: 'Occasion and designer wear. Photos first, unhurried.',
  goodFor: ['ethnic', 'women', 'designer', 'bridal', 'made_to_order'],
  features: [
    'Product photos stacked large, the buy box beside them as you scroll',
    'A full-bleed or arched hero photo',
    'Shop the look: pieces pinned on a photo',
    'A statement footer with your name set large',
    'Buttons with a sheen; photos that grow under the pointer',
    'A focused checkout: your logo and nothing to leave by',
  ],
  styles: [...editorial_1_1_0.styles, ...atelier_1_0_0.styles],
  defaults: {
    pairing: 'cormorant', headings: 'as_typed', size: 'large', corners: 'square', buttons: 'solid', spacing: 'airy', photo: '4:5',
    hoverPhoto: true, phoneColumns: 2, header: 'centred', sticky: true, bottomTabs: false, announcement: null, footer: 'statement',
    social: true, motion: 'subtle', brandColour: null,
    gallery: 'stack', details: 'folded', card: 'standard', desktopColumns: 3, collectionTop: 'banner',
    buttonShape: 'theme', buttonMotion: 'fill', cardHover: 'zoom', entrance: 'fade', reveal: true, buyBoxSticky: true, buyBar: false,
    footerScheme: 'ink', checkout: 'focused',
  },
  allowed: {
    pairings: ['cormorant', 'playfair', 'dmserif', 'fraunces'], headers: ['centred', 'split', 'classic'], footers: ['statement', 'three', 'compact'],
    sections: [...editorial_1_1_0.allowed.sections], heroMasks: ['none', 'arch'],
    choices: {
      corners: ['square', 'soft', 'round'], buttons: ['solid', 'outline'], phoneColumns: [2],
      gallery: ['stack', 'rail', 'thumbs', 'swipe'], buttonShape: ['theme'], buttonMotion: ['fill', 'press', 'lift'], cardHover: ['zoom', 'lift', 'none'],
      entrance: ['fade', 'none'], reveal: [true, false], buyBoxSticky: [true, false], buyBar: [false, true],
      footerScheme: ['ink', 'paper', 'tint'], checkout: ['focused', 'standard'],
    },
  },
  samples: 'festive', rhythm: 'even',
  home: [
    { id: 'hero', key: 'hero', layout: 'image_text', heading: { from: 'shopName' }, text: { from: 'tagline' }, height: 'tall' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 12, layout: 'grid' },
    { id: 'story', key: 'image_text', heading: 'Made by hand', text: '', side: 'right' },
    { id: 'promise', key: 'promises', show: ['cod', 'returns', 'dispatch'], scheme: 'tint' },
    { id: 'best', key: 'products', heading: 'Most loved', source: { kind: 'best_sellers', days: 90 }, count: 8, layout: 'rail' },
  ],
}
