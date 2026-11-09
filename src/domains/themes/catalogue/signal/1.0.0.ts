import type { ThemeManifest } from '../../types'
import { dark, light, style } from '../kit'
import { minimal_2_1_0 } from '../minimal/2.1.0'

// Signal 1.0.0 (spec docs/specs/2026-11-09-theme-signal.md, owner-approved mockup) — for brands whose product is the
// hero: bags, footwear, accessories, western wear. One signal colour as a system (labels as pills, one band, focus),
// a grotesk voice (Schibsted Grotesk; body Inter), products on grey tiles, a floating header, tabs by collection, a
// swipe row that says where you are, a photo footer. An original theme in the genre of design-led D2C sites; none of
// any brand's name, colours, type, copy or layout.
export const signal_1_0_0: ThemeManifest = {
  key: 'signal', version: '1.0.0', name: 'Signal',
  job: 'Bags, footwear and accessories. Your product, front and centre.',
  goodFor: ['accessories', 'footwear', 'jewellery', 'men', 'western'],
  features: [
    'A floating header over your first photo',
    'Your colour as the signal: section labels, one bold band',
    'Products on grey tiles, edge to edge',
    'Best sellers in tabs by collection',
    'A swipe row that says where you are',
    'A footer over your hero photo',
  ],
  styles: [
    style('cobalt', 'Cobalt', {
      paper: light('#FFFFFF', '#151515', '#5E5E5B', '#E2E2DE', '#EFEFEC', '#2742E8'),
      tint: light('#EFEFEC', '#151515', '#55554F', '#DCDCD6', '#FFFFFF', '#2742E8'),
      ink: dark('#121212', '#F4F4F1', '#BDBDB8', '#2A2A2A', '#1C1C1C', '#9DB0FF', '#121212'),
    }, { paper: 'White', tint: 'Grey', ink: 'Black' }),
    style('chilli', 'Chilli', {
      paper: light('#FFFFFF', '#161412', '#5F5A55', '#E4E1DD', '#F0EEEB', '#B8321C'),
      tint: light('#F0EEEB', '#161412', '#57524D', '#DDD9D3', '#FFFFFF', '#B8321C'),
      ink: dark('#141210', '#F5F2EE', '#C2BDB7', '#2C2925', '#1D1A17', '#F59A86', '#141210'),
    }, { paper: 'White', tint: 'Stone', ink: 'Black' }),
    style('forest', 'Forest', {
      paper: light('#FFFFFF', '#121614', '#56605A', '#DFE3E0', '#EDF0EE', '#1E6B47'),
      tint: light('#EDF0EE', '#121614', '#4F5953', '#D6DCD8', '#FFFFFF', '#1E6B47'),
      ink: dark('#101412', '#F1F5F2', '#BAC3BD', '#28302B', '#19201C', '#8FD4AE', '#101412'),
    }, { paper: 'White', tint: 'Mist', ink: 'Black' }),
  ],
  defaults: {
    pairing: 'schibsted', headings: 'as_typed', size: 'large', corners: 'square', buttons: 'solid', spacing: 'regular', photo: '4:5',
    hoverPhoto: true, phoneColumns: 2, header: 'float', sticky: false, bottomTabs: false, announcement: null, footer: 'photo',
    social: true, motion: 'subtle', brandColour: null,
    gallery: 'stack', details: 'folded', card: 'tile', desktopColumns: 4, collectionTop: 'title',
    buttonShape: 'theme', buttonMotion: 'fill', cardHover: 'zoom', entrance: 'fade', reveal: true, buyBoxSticky: true, buyBar: true,
    footerScheme: 'paper', checkout: 'focused', labels: 'pill', railCounter: true,
  },
  allowed: {
    pairings: ['schibsted', 'inter'], headers: ['float', 'classic', 'split'], footers: ['photo', 'statement', 'compact'],
    sections: [...minimal_2_1_0.allowed.sections],
    productLayouts: ['grid', 'rail', 'tabs'], sectionSchemes: ['paper', 'tint', 'ink', 'signal'],
    choices: {
      corners: ['square', 'soft'], buttons: ['solid', 'underline'], buttonShape: ['theme', 'pill'],
      gallery: ['stack', 'swipe', 'thumbs'], buttonMotion: ['fill', 'press', 'lift'], cardHover: ['zoom', 'none'],
      entrance: ['fade', 'rise', 'none'], reveal: [true, false], buyBoxSticky: [true, false], buyBar: [true, false],
      footerScheme: ['paper', 'ink'], checkout: ['focused', 'standard'],
      card: ['tile', 'standard'], desktopColumns: [4, 3], labels: ['pill', 'plain', 'none'], railCounter: [true, false],
    },
  },
  made: { headers: ['float'], footers: ['photo'], sections: ['hero', 'products', 'image_text'] },
  samples: 'signal', rhythm: 'even',
  home: [
    { id: 'hero', key: 'hero', layout: 'image_text', heading: { from: 'shopName' }, text: { from: 'tagline' }, position: 'centre', height: 'tall' },
    { id: 'best', key: 'products', label: 'Bestsellers', heading: 'Crowd favourites.', source: { kind: 'best_sellers', days: 90 }, count: 8, layout: 'tabs' },
    { id: 'new-in', key: 'products', scheme: 'tint', label: 'New arrivals', heading: 'Meet the latest.', source: { kind: 'newest' }, count: 12, layout: 'rail' },
    { id: 'band', key: 'image_text', scheme: 'signal', heading: 'Made to be used, every day.', text: 'Tell shoppers what goes into every piece: the materials, the testing, the details.', side: 'right' },
    { id: 'tiles', key: 'collection_tiles', label: 'Shop by', heading: 'Find yours.', mode: 'auto', count: 4, shape: 'square' },
  ],
}
