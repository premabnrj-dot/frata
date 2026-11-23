import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const kids = {
  key: 'kids',
  tile: { label: 'Kids', order: 30, icon: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 9h8l-1 6h-6zM9 15l-1 6M15 15l1 6' },
  startingHsn: { code: '6209', rank: 40 },
  sized: true, charts: ['kids'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack
