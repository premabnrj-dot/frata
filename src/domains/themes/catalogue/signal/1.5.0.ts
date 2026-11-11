import type { DesignInput } from '../../blocks'
import type { ThemeManifest } from '../../types'
import { signal_1_4_0 } from './1.4.0'

// Signal 1.5.0 (Theme Studio TS1b, docs/plans/2026-11-11-theme-studio-ts1.md; owner-approved TS0b board v2) — 1.4 plus
// four designs that sell: The drop, One piece, Behind the bench and The edits. Each draws what the board draws, no
// more (a grid of 4, tiles ≤ 4, one featured piece, one loop). What only the owner can choose (the piece, the date,
// the collections, the video) is theirs to fill; words that make a claim start as examples. Block ids are stable: a
// later minor only adds (themeCheck). 1.4 stays as released.

const sample = (name: string, alt: string) => ({ base: `/themes/samples/${name}`, widths: [400, 800], width: 800, height: 1000, alt, decorative: false, focus: null })

const theDrop: DesignInput = {
  id: 'the-drop', name: 'The drop', line: 'A date, four pieces from it, one button',
  tags: ['drop', 'launch', 'new', 'coming soon', 'collection', 'date', 'products'],
  children: [
    { id: 'heading', kind: 'heading', size: 'l', text: 'The monsoon drop', fill: { label: 'Heading' } },
    { id: 'date', kind: 'date', fill: { label: 'Drop date' } },
    { id: 'pieces', kind: 'product_grid', source: { kind: 'newest' }, fill: { label: 'Pieces' } },
    { id: 'button', kind: 'button', label: 'Shop the drop', link: '/products', fill: { label: 'Button' } },
  ],
}

const onePiece: DesignInput = {
  id: 'one-piece', name: 'One piece', line: 'One piece beside a photo, in your words',
  tags: ['featured', 'hero product', 'spotlight', 'product', 'bestseller', 'story'],
  children: [{
    id: 'cols', kind: 'columns', phone: 'stack', children: [
      { id: 'photo', kind: 'image', ratio: '4:5', image: sample('haldi-kurta-b', 'A haldi kurta worn in the sun'), fill: { label: 'Photo' } },
      { id: 'about', kind: 'group', children: [
        { id: 'piece', kind: 'featured_product', fill: { label: 'Piece' } },
        { id: 'words', kind: 'text', body: [[{ text: 'Hand-block printed in Bagru with natural dyes. Soft from the first wear, softer every wash.' }]], fill: { label: 'Why this piece', example: true } },
      ] },
    ],
  }],
}

const behindTheBench: DesignInput = {
  id: 'behind-the-bench', name: 'Behind the bench', line: 'A short video of the making, beside your words',
  tags: ['video', 'workshop', 'process', 'craft', 'maker', 'story', 'how it’s made'],
  children: [{
    id: 'cols', kind: 'columns', phone: 'stack', children: [
      { id: 'video', kind: 'video', ratio: '4:5', poster: sample('tan-loafer-d', 'A loafer on the workbench'), fill: { label: 'Video' } },
      { id: 'words', kind: 'group', children: [
        { id: 'heading', kind: 'heading', size: 'm', text: 'Behind the bench', fill: { label: 'Heading' } },
        { id: 'story', kind: 'text', body: [[{ text: 'Every pair is lasted, stitched and burnished by hand in our Agra workshop: about two days a pair.' }]], fill: { label: 'How you make it', example: true } },
        { id: 'button', kind: 'button', label: 'See the pieces', link: '/products', fill: { label: 'Button' } },
      ] },
    ],
  }],
}

const theEdits: DesignInput = {
  id: 'the-edits', name: 'The edits', line: 'Your words beside four collections',
  tags: ['collections', 'categories', 'edits', 'shop by', 'circles', 'browse'],
  children: [{
    id: 'cols', kind: 'columns', phone: 'stack', children: [
      { id: 'words', kind: 'group', children: [
        { id: 'heading', kind: 'heading', size: 'm', text: 'The edits', fill: { label: 'Heading' } },
        { id: 'line', kind: 'text', body: [[{ text: 'Four ways into the shop.' }]], fill: { label: 'Words' } },
        { id: 'button', kind: 'button', label: 'Shop all', link: '/products', fill: { label: 'Button' } },
      ] },
      { id: 'tiles', kind: 'collection_tiles', mode: 'auto', shape: 'circle', fill: { label: 'Collections' } },
    ],
  }],
}

export const signal_1_5_0: ThemeManifest = {
  ...signal_1_4_0,
  version: '1.5.0',
  features: [...signal_1_4_0.features, 'Designs: The drop, One piece, Behind the bench and The edits, with your pieces, dates, video and collections'],
  allowed: { ...signal_1_4_0.allowed, videoSections: [...(signal_1_4_0.allowed.videoSections ?? []), 'design'] },
  designs: [...signal_1_4_0.designs!, theDrop, onePiece, behindTheBench, theEdits],
}
