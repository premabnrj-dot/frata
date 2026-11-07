'use client'

import { BagContents } from './bag'

export function BagPage() {
  return (
    <section className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-4 text-3xl" style={{ fontFamily: 'var(--store-display)' }}>Your bag</h1>
      <BagContents onCheckout={() => window.location.assign('/checkout')} onKeepShopping={() => window.location.assign('/products')} />
    </section>
  )
}
