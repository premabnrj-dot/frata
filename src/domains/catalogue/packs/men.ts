import { pure } from './define'
import type { Pack } from './types'
import { FASHION_RETURNS } from './shared'

export const men = /*#__PURE__*/ pure(() => ({
  key: 'men',
  tile: { label: 'Men', order: 20, icon: 'M8 3l4 2 4-2 4 4-3 3v11H7V10L4 7z' },
  startingHsn: { code: '6203', rank: 30 },
  sized: true, charts: ['mens_shirt'], label: false,
  returns: FASHION_RETURNS,
}) as const satisfies Pack)
