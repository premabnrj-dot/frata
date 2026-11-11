import type { DesignInput } from '../../blocks'
import type { ThemeManifest } from '../../types'
import { signal_1_3_0 } from './1.3.0'

// Signal 1.4.0 (Theme Studio TS0b, docs/plans/2026-11-11-theme-studio-ts0b.md; owner-approved board v2) — 1.3 plus two
// designs built from blocks: Size help and Made by hand. Owners add them in Look and fill what the theme marks; words
// that make a claim start as examples and never reach a shop until the owner writes their own. Block ids are stable:
// a later minor only adds (themeCheck). 1.3 stays as released: its shops see nothing until they move up.

const sample = (name: string, alt: string) => ({ base: `/themes/samples/${name}`, widths: [400, 800], width: 800, height: 1000, alt, decorative: false, focus: null })

const sizeHelp: DesignInput = {
  id: 'size-help', name: 'Size help', line: 'How to pick a size, your answers, a photo',
  tags: ['size', 'fit', 'measure', 'size chart', 'returns', 'exchange', 'faq'],
  children: [{
    id: 'cols', kind: 'columns', phone: 'stack', children: [
      { id: 'words', kind: 'group', children: [
        { id: 'heading', kind: 'heading', size: 'l', text: 'Find your size', fill: { label: 'Heading' } },
        { id: 'intro', kind: 'text', body: [[{ text: 'Our sizes run true to Indian sizes. Between two? Go up one: leather gives a little in the first week.' }]], fill: { label: 'How your sizes run', example: true } },
        { id: 'faq', kind: 'accordion', items: [
          { q: 'How do I measure my foot?', a: 'Stand on paper at the end of the day, mark your heel and longest toe, and measure in cm. Match it to the chart on each product.' },
          { q: 'I’m between two sizes', a: 'Go up one. The leather moulds to you in a week of wear.' },
          { q: 'Can I exchange the size?', a: 'Yes, within 7 days of delivery, unworn.' },
        ], fill: { label: 'Questions', example: true } },
        { id: 'button', kind: 'button', label: 'Returns and exchanges', link: '/policies/returns', fill: { label: 'Button' } },
      ] },
      { id: 'photo', kind: 'image', ratio: '4:5', image: sample('tan-loafer-b', 'A tan loafer from the side'), fill: { label: 'Photo' } },
    ],
  }],
}

const step = (n: string, heading: string, words: string, photo: string, alt: string) => ({
  id: `step-${n}`, kind: 'group' as const, children: [
    { id: `photo-${n}`, kind: 'image' as const, ratio: '4:5' as const, image: sample(photo, alt), fill: { label: `Photo ${n}` } },
    { id: `heading-${n}`, kind: 'heading' as const, size: 's' as const, text: heading, fill: { label: `Step ${n}`, example: true as const } },
    { id: `words-${n}`, kind: 'text' as const, body: [[{ text: words }]], fill: { label: `Step ${n} words`, example: true as const } },
  ],
})

const madeByHand: DesignInput = {
  id: 'made-by-hand', name: 'Made by hand', line: 'Three steps of how it’s made',
  tags: ['craft', 'process', 'handmade', 'how it’s made', 'story', 'maker', 'materials'],
  children: [
    { id: 'heading', kind: 'heading', size: 'l', text: 'How it’s made', fill: { label: 'Heading' } },
    { id: 'steps', kind: 'columns', phone: 'swipe', children: [
      step('1', 'Cut', 'Full-grain leather, cut by hand to the last.', 'oxblood-loafer', 'An oxblood loafer'),
      step('2', 'Stitched', 'Welted, so it can be resoled for years.', 'sand-boot', 'A sand boot with its stitched welt'),
      step('3', 'Finished', 'Burnished by hand, then boxed.', 'tan-loafer', 'A finished tan loafer'),
    ] },
  ],
}

export const signal_1_4_0: ThemeManifest = {
  ...signal_1_3_0,
  version: '1.4.0',
  features: [...signal_1_3_0.features, 'Designs: Size help and Made by hand, filled with your words and photos'],
  allowed: { ...signal_1_3_0.allowed, sections: [...signal_1_3_0.allowed.sections, 'design'] },
  designs: [sizeHelp, madeByHand],
}
