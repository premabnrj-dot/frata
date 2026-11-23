import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const accessories = {
  key: 'accessories',
  tile: { label: 'Bags and accessories', order: 60, icon: 'M5 9h14l-1.5 11h-11zM9 9a3 3 0 0 1 6 0' },
  startingHsn: { code: '4202', rank: 60 },
  sized: false, charts: ['one_size'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack
