import type { Scheme, Style, ThemeManifest } from '../../types'

// Classic 1.0.0 — today's shop, exactly (themes plan T0·4). Its colours are the --store-* values the shop has
// always used (globals.css [data-store-theme]); __tests__/classic.test.ts holds them equal until T1 removes the CSS copy.
// Released files never change (a new version is a new file).

const base: Omit<Scheme, 'accent'> = {
  bg: '#F6F1EA', text: '#1F1A17', sub: '#5A4A3C', line: '#E2D9CC', chip: '#EFE8DE',
  onAccent: '#F6F1EA', button: '#1F1A17', onButton: '#F6F1EA', good: '#1E6B47', bad: '#A8321F', sale: '#A8321F',
}
const style = (key: string, name: string, accent: Scheme['accent']): Style => ({ key, name, schemes: { paper: { ...base, accent } } })

export const classic_1_0_0: ThemeManifest = {
  key: 'classic',
  version: '1.0.0',
  name: 'Classic',
  job: 'Your shop as it is today. Simple and quick.',
  features: ['Your name and tagline up top', 'Collection tiles', 'Newest pieces first', 'Rounded cards, two columns on a phone'],
  styles: [style('oxide', 'Oxide', '#8A3B1F'), style('indigo', 'Indigo', '#2E3A63'), style('moss', 'Moss', '#3F5B3A'), style('wine', 'Wine', '#7A1F2B'), style('ink', 'Ink', '#1F1A17')],
  defaults: { pairing: 'fraunces', header: 'classic', footer: 'three' },
  allowed: { pairings: ['fraunces', 'cormorant', 'inter'], headers: ['classic'], footers: ['three'], sections: ['hero', 'collection_tiles', 'products'] },
  home: [
    { id: 'hero', key: 'hero', hidden: false, scheme: 'paper', layout: 'text', heading: { from: 'shopName' }, text: { from: 'tagline' } },
    { id: 'tiles', key: 'collection_tiles', hidden: false, scheme: 'paper', heading: '', mode: 'auto', count: 6, shape: 'portrait' },
    { id: 'new-in', key: 'products', hidden: false, scheme: 'paper', heading: 'New in', source: { kind: 'newest' }, count: 24, viewAll: true },
  ],
}
