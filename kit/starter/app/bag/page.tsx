import { api, type Shop } from '@/lib/frrata'
import { BagView } from '@/components/bag-view'


/** The bag. Checkout is the store's own, on Frrata. */
export default async function BagPage() {
  const s = await api<Shop>('shop')
  return <><h1>Your bag</h1>{s ? <BagView checkoutOrigin={s.checkoutOrigin} /> : null}</>
}
