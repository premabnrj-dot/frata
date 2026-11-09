import type { ThemeManifest } from '../../types'
import { signal_1_1_0 } from './1.1.0'

// Signal 1.2.0 (S2, docs/plans/2026-11-09-signal-s2.md; approved board "Home · computer") — 1.1 plus the story half:
// Image with text as a Spotlight, the Story fan, the Statement, a handwritten line on the Hero, the bigger heading
// scale, and the board's order for a new look's home. 1.1 stays as released (live shops unchanged until they move up).
export const signal_1_2_0: ThemeManifest = {
  ...signal_1_1_0,
  version: '1.2.0',
  features: [...signal_1_1_0.features, 'Story sections: a spotlight, a fan of stories, a handwritten statement'],
  allowed: {
    ...signal_1_1_0.allowed,
    sections: [...signal_1_1_0.allowed.sections, 'story_fan', 'statement'],
    imageTextLayouts: ['spotlight'], heroScript: true,
  },
  made: { ...signal_1_1_0.made, sections: ['hero', 'products', 'image_text', 'story_fan', 'statement'] },
  scale: 'signal',
  home: [
    { id: 'hero', key: 'hero', layout: 'image_text', script: 'New season', heading: { from: 'shopName' }, text: { from: 'tagline' }, button: { label: 'Shop now', link: '/products' }, position: 'centre', height: 'tall' },
    { id: 'spotlight', key: 'image_text', layout: 'spotlight', label: 'In spotlight', heading: 'Built for every day.', text: 'Tell shoppers what makes one piece special: the material, the detail, where it goes.', button: { label: 'Explore', link: '/products' }, side: 'left' },
    { id: 'best', key: 'products', label: 'Bestsellers', heading: 'Crowd favourites.', source: { kind: 'best_sellers', days: 90 }, count: 8, layout: 'tabs' },
    { id: 'new-in', key: 'products', scheme: 'tint', label: 'New arrivals', heading: 'Meet the latest.', source: { kind: 'newest' }, count: 12, layout: 'rail' },
    { id: 'band', key: 'image_text', scheme: 'signal', heading: 'Made to be used, every day.', text: 'Tell shoppers what goes into every piece: the materials, the testing, the details.', side: 'right' },
    { id: 'stories', key: 'story_fan', heading: 'Out in the city.', text: 'Your pieces where they live: the commute, the weekend, the late shift.' },
    { id: 'statement', key: 'statement', eyebrow: 'Made for', wordmark: 'the long way' },
  ],
}
