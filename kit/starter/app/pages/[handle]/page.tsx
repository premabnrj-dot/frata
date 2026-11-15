import { notFound } from 'next/navigation'
import { api, previewOr, type Shop, type StorePage } from '@/lib/frrata'
import { Blocks } from '@/components/blocks'

export const revalidate = 60
export const generateStaticParams = () => []

/** About, Contact and the store's other pages, block by block (a hidden one only while the brand previews it). */
export default async function Page({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const [page, s] = await Promise.all([previewOr<StorePage>(`pages/${encodeURIComponent(handle)}`), api<Shop>('shop')])
  if (!page) notFound()
  return <><h1>{page.title}</h1><Blocks blocks={page.blocks} policies={new Map((s?.policies ?? []).map((p) => [p.kind, p.url]))} /></>
}
