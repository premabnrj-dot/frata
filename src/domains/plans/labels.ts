import type { Feature } from './entitlements'

/** How a feature is named to people, in Admin and (later) the console. One list. */
export const FEATURE_NAMES: Record<Feature, string> = {
  rto_shield: 'RTO Shield',
  size_fit: 'Size and fit',
  cart_flows: 'Cart flows',
}
