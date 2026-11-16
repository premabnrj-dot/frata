import { notFound } from 'next/navigation'
import { api, type Card } from '@/lib/frrata'
import { ProductCard } from '@/components/card'


/** A collection, in the store's own order. */
export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const c = await api<{ collection: { title: string; description: string }; products: Card[] }>(`collections/${encodeURIComponent(handle)}/page/1`)
  if (!c) notFound()
  return <><h1>{c.collection.title}</h1>{c.collection.description ? <p>{c.collection.description}</p> : null}
    <div className="grid">{c.products.map((p) => <ProductCard key={p.id} p={p} />)}</div></>
}
