import type { IconName } from '@/components/icons/icon'
import type { ModuleKey } from '@/domains/modules/registry'

/** Each app's icon: the Apps list and the sidebar's Apps entries read this one map. */
export const MODULE_ICON: Record<ModuleKey, IconName> = {
  communication: 'messages', rto_shield: 'risk', ship: 'shipped', true_profit: 'profit', reviews: 'reviews',
  marketplace_export: 'stock', size_fit: 'size', cart_flows: 'orders', gst: 'tax', ekcode: 'people', product_video: 'video',
}
