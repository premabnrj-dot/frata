import { notFound } from 'next/navigation'
import { api, type Faq, type Shop } from '@/lib/frrata'
import { Questions } from '@/components/blocks'


/** The store's questions, answered from its own Settings. */
export default async function FaqPage() {
  const [f, s] = await Promise.all([api<Faq>('faq'), api<Shop>('shop')])
  if (!f) notFound()
  return <><h1>{f.title}</h1><Questions items={f.items} policies={new Map((s?.policies ?? []).map((p) => [p.kind, p.url]))} /></>
}
