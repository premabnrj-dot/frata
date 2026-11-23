import { pure } from './define'
import type { Pack } from './types'
import { SEALED_RETURNS } from './shared'

export const wellness = /*#__PURE__*/ pure(() => ({
  key: 'wellness',
  tile: { label: 'Wellness', order: 90, icon: 'M12 21c-5-3-8-7-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11z' },
  startingHsn: { code: '3004', rank: 90 },
  sized: false, charts: ['one_size'], label: true,
  returns: SEALED_RETURNS,
}) as const satisfies Pack)
