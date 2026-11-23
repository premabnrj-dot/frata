import type { Pack } from './types'
import { SEALED_RETURNS } from './shared'

export const beauty = {
  key: 'beauty',
  tile: { label: 'Beauty and personal care', order: 80, icon: 'M9 3h6v4l2 3v10H7V10l2-3z' },
  startingHsn: { code: '3304', rank: 80 },
  sized: false, charts: ['one_size'], label: true,
  returns: SEALED_RETURNS,
} as const satisfies Pack
