import type { ThemeManifest } from '../../types'
import { light, dark, style } from '../kit'

// Minimal 1.0.0 — clean grid, square corners, uppercase, for basics and streetwear.
export const minimal_1_0_0: ThemeManifest = {
  key: 'minimal', version: '1.0.0', name: 'Minimal',
  job: 'Clean grid, square corners. For basics and streetwear.',
  goodFor: ['men', 'women', 'basics', 'streetwear'],
  features: ['A tall photo, nothing else', 'Uppercase, tracked type', 'Edge-to-edge product grid', 'Outline buttons', 'Square corners'],
  styles: [
    style('ink', 'Ink', {
      paper: light('#FFFFFF', '#111111', '#555555', '#E5E5E5', '#F4F4F4', '#111111'),
      tint: light('#F2F2F2', '#111111', '#505050', '#DDDDDD', '#FFFFFF', '#111111'),
      ink: dark('#111111', '#FFFFFF', '#C2C2C2', '#333333', '#1F1F1F', '#FFFFFF', '#111111'),
    }, { paper: 'White', tint: 'Grey', ink: 'Black' }),
    style('paper', 'Paper', {
      paper: light('#F7F5F0', '#1C1C1C', '#545454', '#E3E0D9', '#EFECE5', '#3D3D3D'),
      tint: light('#ECE8DF', '#1C1C1C', '#4D4D4D', '#DAD5CA', '#F7F5F0', '#3D3D3D'),
      ink: dark('#1C1C1C', '#F7F5F0', '#C4C1BA', '#383838', '#262626', '#F7F5F0', '#1C1C1C'),
    }, { paper: 'Paper', tint: 'Stone', ink: 'Black' }),
  ],
  defaults: {
    pairing: 'inter', headings: 'upper', size: 'regular', corners: 'square', buttons: 'outline', spacing: 'regular', photo: '3:4',
    hoverPhoto: true, phoneColumns: 2, header: 'minimal', sticky: true, bottomTabs: false, announcement: null, footer: 'compact',
    social: true, motion: 'none', brandColour: null,
  },
  allowed: { pairings: ['inter', 'dmserif'], headers: ['minimal', 'classic'], footers: ['compact', 'three'], sections: ['hero', 'collection_tiles', 'products', 'price_tiles', 'promises', 'image_text', 'drop_teaser', 'rich_text', 'logos'] },
  home: [
    { id: 'hero', key: 'hero', layout: 'image', heading: { from: 'shopName' }, height: 'tall' },
    { id: 'new-in', key: 'products', heading: 'New in', source: { kind: 'newest' }, count: 8, layout: 'grid' },
    { id: 'tiles', key: 'collection_tiles', heading: 'Shop by', mode: 'auto', count: 4, shape: 'square' },
  ],
}
