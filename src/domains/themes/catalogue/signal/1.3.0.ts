import type { ThemeManifest } from '../../types'
import { signal_1_2_0 } from './1.2.0'

// Signal 1.3.0 (S3, docs/plans/2026-11-09-signal-s3.md; approved board "Product page") — 1.2 plus the product page's
// stories (stacked under a stacked gallery, else slides "1 / 6") and "Pair it with" (two pieces, Add or Choose).
// 1.2 stays as released: its shops see neither until they move up.
export const signal_1_3_0: ThemeManifest = {
  ...signal_1_2_0,
  version: '1.3.0',
  features: [...signal_1_2_0.features, 'Product stories: photos with numbered notes, and two pieces to pair with'],
  allowed: { ...signal_1_2_0.allowed, productStories: true, pairWith: true },
}
