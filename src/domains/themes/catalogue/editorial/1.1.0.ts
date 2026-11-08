import type { ThemeManifest } from '../../types'
import { editorial_1_0_0 } from './1.0.0'

// Editorial 1.1.0 — 1.0 plus Shop the look (themes T2). Built on 1.0, never a copy of its colours: a released file
// never changes, and a new version only adds. A shop on 1.0 moves by Try (same theme: everything comes across).
export const editorial_1_1_0: ThemeManifest = {
  ...editorial_1_0_0,
  version: '1.1.0',
  features: [...editorial_1_0_0.features, 'Shop the look: pieces pinned on a photo'],
  allowed: { ...editorial_1_0_0.allowed, sections: [...editorial_1_0_0.allowed.sections, 'shop_the_look'] },
}
