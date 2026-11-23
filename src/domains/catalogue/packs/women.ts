import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const women = {
  key: 'women',
  tile: { label: 'Women', order: 10, icon: 'M9 3h6l1 5-2 1 2 12H8l2-12-2-1z' },
  startingHsn: { code: '6204', rank: 20 },
  sized: true, charts: ['womens_kurta'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack
