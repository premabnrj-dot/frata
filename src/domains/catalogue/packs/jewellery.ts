import type { Pack } from './types'
import { JEWELLERY_RETURNS } from './shared'

export const jewellery = {
  key: 'jewellery',
  tile: { label: 'Jewellery', order: 70, icon: 'M6 4h12l3 5-9 11L3 9zM3 9h18' },
  startingHsn: { code: '7117', rank: 70 },
  sized: false, charts: ['one_size'], label: false,
  returns: JEWELLERY_RETURNS,
} as const satisfies Pack
