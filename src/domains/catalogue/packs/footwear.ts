import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const footwear = {
  key: 'footwear',
  tile: { label: 'Footwear', order: 50, icon: 'M3 16c4 0 6-2 8-6l3 3c2 2 4 3 7 3v3H3z' },
  startingHsn: { code: '6403', rank: 50 },
  sized: true, charts: ['footwear'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack
