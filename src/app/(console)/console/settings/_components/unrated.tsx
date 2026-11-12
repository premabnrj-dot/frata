import Link from 'next/link'
import type { Unrated } from '@/domains/tax/rates'

/** Settings › Taxes, once the shop charges GST: the live products checkout refuses for want of a rate (a risk: Rule 0). */
export function UnratedNotice({ u }: { u: Unrated | null }) {
  if (!u || u.count === 0) return null
  const more = u.count - u.products.length
  return (
    <p role="alert" className="mt-3 rounded-md border border-warn-text/30 bg-warn px-3 py-2 text-sm text-warn-text">
      {u.count === 1 ? '1 product' : `${u.count} products`} can’t be bought until {u.count === 1 ? 'it has' : 'they have'} a GST rate:{' '}
      {u.products.map((p, i) => (
        <span key={p.handle}>{i > 0 ? (i === u.products.length - 1 && more === 0 ? ' and ' : ', ') : ''}
          <Link href={`/console/products/${encodeURIComponent(p.handle)}`} prefetch={false} className="underline">{p.title}</Link></span>
      ))}
      {more > 0 ? ` and ${more} more` : ''}.{' '}
      <Link href="/console/products/tax" prefetch={false} className="font-semibold underline">Set rates</Link>
    </p>
  )
}
