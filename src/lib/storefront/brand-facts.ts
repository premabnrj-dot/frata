import 'server-only'
import { formatPhone } from '@/lib/format'
import type { BrandFacts } from '@/components/storefront/brand-parts'

/** The facts a code-site store's frame draws in its legal block (one-address P2·3), from the store's settings: the one
 *  builder for the live pages (src/app/s/[host]/_brand.ts) and Console › Brand › Checkout's preview. The phone reads
 *  as people read it ("+91 98450 12345"), formatted here so the frame's parts carry no formatter to the browser. */
export const brandFactsOf = (s: BrandFacts): BrandFacts => ({
  shopName: s.shopName, legalName: s.legalName, address: s.address, supportEmail: s.supportEmail,
  supportPhone: s.supportPhone ? formatPhone(s.supportPhone) : '', grievanceName: s.grievanceName, grievanceEmail: s.grievanceEmail,
})
