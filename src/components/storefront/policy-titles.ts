import type { PolicyPage } from '@/domains/policies/render'

/** A policy page's title as shoppers read it: the one home (policy.tsx re-exports it). Its own module so a page that
 *  only links to the policies (the brand frame's footer, the console's checkout preview) doesn't carry the renderer. */
export const POLICY_TITLE: Record<PolicyPage, string> = { returns: 'Returns and exchanges', shipping: 'Shipping', privacy: 'Privacy', terms: 'Terms of sale', contact: 'Contact us' }
