import type { Metadata } from 'next'
import { BagPage } from '@/components/storefront/bag-page'

export const revalidate = 60
export const metadata: Metadata = { title: 'Your bag', robots: { index: false, follow: false } }

/** The bag as a page (the same contents as the drawer). Static: the bag lives in the browser. */
export default function Bag() {
  return <BagPage />
}
