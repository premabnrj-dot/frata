import type { ThemeManifest } from '../../types'
import { editorial_2_0_0 } from './2.0.0'

// Editorial 2.1.0 (Look v3) — 2.0 plus two headers made for it (Centred with a shop panel; Over the photo) and the
// Instagram strip footer; says which designs and sections were made for it. Built on 2.0, never a copy.
export const editorial_2_1_0: ThemeManifest = {
  ...editorial_2_0_0,
  version: '2.1.0',
  features: [...editorial_2_0_0.features, 'Headers made for it: a shop panel of your collections, or over the photo'],
  allowed: { ...editorial_2_0_0.allowed, headers: [...editorial_2_0_0.allowed.headers, 'panel', 'overlay'], footers: [...editorial_2_0_0.allowed.footers, 'gram'] },
  made: { headers: ['centred', 'panel', 'overlay'], footers: ['statement', 'gram'], sections: ['hero', 'image_text', 'shop_the_look', 'products'] },
}
