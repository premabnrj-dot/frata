import { Icon } from '@/components/icons/icon'
import { MODULE_ICON } from '@/components/modules/icons'
import type { ModuleKey } from '@/domains/modules/registry'

/** An app's icon on its tile (Apps gallery): the tile is a brand surface, so the rani tinge shows (data-tinge). */
export function AppTile({ k, size = 'md' }: { k: ModuleKey; size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden="true" data-tinge className={`inline-grid shrink-0 place-items-center bg-muted ${size === 'lg' ? 'size-16 rounded-2xl' : 'size-11 rounded-xl'}`}>
      <Icon name={MODULE_ICON[k] ?? 'apps'} className={size === 'lg' ? 'size-8' : 'size-6'} />
    </span>
  )
}
