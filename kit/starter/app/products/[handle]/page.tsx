import { notFound, permanentRedirect } from 'next/navigation'
import { api, rupees, type Product, type Shop } from '@/lib/frrata'
import { Photo } from '@/components/photo'
import { AddToBag } from '@/components/add-to-bag'

export const revalidate = 60
export const generateStaticParams = () => []

/** One product. An old address answers with the current handle: send the shopper there. Never invent a fact. */
export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [p, s] = await Promise.all([api<Product>(`products/${encodeURIComponent(handle)}`), api<Shop>('shop')])
  if (!p) notFound()
  if (p.handle !== handle) permanentRedirect(`/products/${p.handle}`)
  const sizeAt = Math.max(0, p.options.findIndex((o) => o.toLowerCase() === 'size'))
  const sizes = p.variants.map((v) => ({ id: v.id, label: v.values[sizeAt] ?? v.values.join(' / '), price: v.price, canBuy: v.availability.kind !== 'sold_out' }))
  return (
    <div className="product">
      <div className="gallery">{p.images.slice(0, 4).map((im, i) => <Photo key={i} image={im} sizes="(max-width: 720px) 100vw, 50vw" priority={i === 0} />)}</div>
      <div>
        <h1>{p.title}</h1>
        {p.price ? <p className="price">{rupees(p.price.min)}{p.price.priorPrice ? <s> {rupees(p.price.priorPrice)}</s> : null}</p> : null}
        {s?.payOnDelivery.on ? <p className="cod">Pay on delivery available</p> : null}
        <AddToBag title={p.title} sizes={sizes} />
        <p>{p.description}</p>
        <dl>{p.details.map((d, i) => <div key={i}><dt>{d.name}</dt><dd>{d.value}</dd></div>)}</dl>
      </div>
    </div>
  )
}
