import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const ethnic = {
  key: 'ethnic',
  tile: { label: 'Ethnic wear', order: 40, icon: 'M12 3l3 4-1 3 3 11H7l3-11-1-3z' },
  startingHsn: { code: '6211', rank: 10 },
  sized: true, charts: ['womens_kurta'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack
