import type { ThemeManifest } from '../../types'
import { minimal_2_0_0 } from './2.0.0'

// Studio 2.1.0 (Look v3) — 2.0 plus the header Over the photo and the Instagram strip footer; says which designs and
// sections were made for it.
export const minimal_2_1_0: ThemeManifest = {
  ...minimal_2_0_0,
  version: '2.1.0',
  allowed: { ...minimal_2_0_0.allowed, headers: [...minimal_2_0_0.allowed.headers, 'overlay'], footers: [...minimal_2_0_0.allowed.footers, 'gram'] },
  made: { headers: ['split', 'overlay'], footers: ['statement', 'gram'], sections: ['hero', 'products', 'collection_tiles'] },
}
