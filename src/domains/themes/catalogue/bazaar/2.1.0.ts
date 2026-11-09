import type { ThemeManifest } from '../../types'
import { bazaar_2_0_0 } from './2.0.0'

// Bazaar 2.1.0 (Look v3) — 2.0 plus the Instagram strip footer; says which designs and sections were made for it.
export const bazaar_2_1_0: ThemeManifest = {
  ...bazaar_2_0_0,
  version: '2.1.0',
  allowed: { ...bazaar_2_0_0.allowed, footers: [...bazaar_2_0_0.allowed.footers, 'gram'] },
  made: { headers: ['circles'], footers: ['three', 'gram'], sections: ['products', 'price_tiles', 'collection_tiles', 'promises', 'drop_teaser'] },
}
