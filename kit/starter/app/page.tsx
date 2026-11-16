import { api, type Card } from '@/lib/frrata'
import { ProductCard } from '@/components/card'


/** Home: the store's listed products, newest first, 48 to a page. */
export default async function Home() {
  const page = await api<{ products: Card[] }>('products/page/1')
  return <div className="grid">{(page?.products ?? []).map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}</div>
}
